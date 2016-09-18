/**
 * This module provides functionality for communicating with azure table in a
 * minimally abstracted way.
 *
 * When in doubt consult: https://msdn.microsoft.com/en-us/library/azure/dd179423.aspx
 *
 * @flow
 */
import invariant from 'assert';
import URL from 'url';
import HttpClient from 'silk-http-client';
import { Headers } from 'silk-fetch';
import formatURL from 'silk-utils/url_format';

import * as tableSigner from './signer/table';
import tableFilter from './table_filter';
import connectionString from './connection_string';

import type {Request} from 'silk-http-client';
import type {Sas} from './signer/table';
import type {ConnectionString} from './connection_string';

type AuthProvider = SharedAccessTokenAuth | SharedKeyAuth;
type RequestIdFactory = (req: Request) => string;

type TableClientOptions = {
  name?: string;
  requestId?: RequestIdFactory;
};

export type CorsRule = {
  allowedOrigins: Array<string>;
  allowedMethods: Array<string>;
  allowedHeaders: Array<string>;
  exposedHeaders: Array<string>;
  maxAgeInSeconds: number;
};

/**
 * Azure table entities are very flexible but require RowKey and PartitionKey
 * for scalability reasons.. Every entity must have them.
 */
export type Entity = {[key: string]: any} | {
  RowKey: string;
  PartitionKey: string;
  ETag?: string;
};

const SHARED_AUTH_SIGNED_HEADERS = new Set([
  'Content-MD5',
  'Content-Type',
  'Date',
]);

export class SharedKeyAuth {
  _auth: ConnectionString;
  constructor(auth: string) {
    // Parse out the connection string...
    this._auth = connectionString(auth);
  }

  requestTransformer(req: Request): Promise<Request> {
    let [url, options] = req;
    let headers = options.headers;
    invariant(headers);

    // Shared Key Auth requires singing of a few values ...
    let headersToSign = {};
    for (let header of SHARED_AUTH_SIGNED_HEADERS) {
      headersToSign[header] = headers.get(header);
    }

    let parsed = URL.parse(url);
    parsed.path = parsed.path || '';

    // Inject any passed query string parameters into the request.
    delete parsed.search;
    if (options.query) {
      parsed.query = options.query;
    }

    const auth = tableSigner.sharedKey({
      account: this._auth.account,
      accessKey: this._auth.accessKey,
      method: options.method,
      headers: headersToSign,
      table: parsed.path,
      query: parsed.query || {},
    });
    headers.set('Authorization', auth);

    let formattedUrl = formatURL(parsed);
    return Promise.resolve([this._auth.tableEndpoint + formattedUrl, options]);
  }
}

export class SharedAccessTokenAuth {
  _host: string;
  _sas: Sas;
  constructor(host: string, sas: Sas) {
    this._sas = sas;

    if (URL.parse(host).protocol) {
      this._host = host;
    } else {
      this._host = azureTableUrl(host);
    }
  }

  requestTransformer(req: Request): Promise<Request> {
    let [url, options] = req;
    let parsed = URL.parse(url);

    let query = Object.assign({}, options.query || {}, this._sas);

    // Inject any passed query string parameters into the request.
    delete parsed.search;
    parsed.query = query;

    return Promise.resolve([this._host + formatURL(parsed), options]);
  }
}

/**
 * Construct the default server url used by azure table.
 */
export function azureTableUrl(account: string): string {
  return `https://${account}.table.core.windows.net/`;
}

/**
 * Construct a path for a single entity operation (delete, query, etc..).
 */
function formatSingleEntityPath(table: string, entity: Entity): string {
  let {RowKey, PartitionKey} = entity;
  invariant(RowKey);
  invariant(PartitionKey);

  // XXX: Should PartitionKey and RowKey be urlencoded ?
  return `${table}(PartitionKey='${PartitionKey}', RowKey='${RowKey}')`;
}

function requestJSON(
  path: string,
  method: string,
  body: Object
): Request {
  return [path, {
    body: JSON.stringify(body),
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
  }];
}


function extractErrorCode(err: Object): ?string {
  if (err.body && typeof err.body === 'object') {
    if ('odata.error' in err.body) {
      invariant(err.body['odata.error']);
      invariant(typeof err.body['odata.error'] === 'object');
      return err.body['odata.error'].code;
    }
  }
  return null;
}

const COMMON_HEADERS = {
  // ensure we are always using the right version of azure
  'x-ms-version': '2013-08-15',
  // default to minimalistic json
  'Accept': 'application/json',
};

export class TableClient extends HttpClient {
  _authProvider: AuthProvider;
  _requestId: RequestIdFactory;

  /**
   * We explicitly require the host here since eventually we will want to do
   * certificate pinning ...
   */
  constructor(
    provider: AuthProvider,
    options?: TableClientOptions = {},
  ) {
    super({
      // TODO: Might need to fine tune the retry options ...

      // XXX: Hack for flow manually set fake requestTransformer here then set
      // it to the real one after the super call to avoid the uninitialized
      // value errors.
      requestTransformer: (req: Request): Promise<Request> => Promise.resolve(req),
    });

    this.requestTransformer = (req: Request): Promise<Request> => {
      let [url, options] = req;
      let headers = options.headers = options.headers || new Headers();
      headers.set('Date', new Date().toUTCString());

      // Helper to add the x-ms-client-request-id header value.
      if (this._requestId) {
        headers.set(
          'x-ms-client-request-id',
          this._requestId([url, options]),
        );
      }

      for (let name in COMMON_HEADERS) {
        headers.set(name, COMMON_HEADERS[name]);
      }

      return this._authProvider.requestTransformer([url, options]);
    };

    this._authProvider = provider;
    // TODO: Figure out more unique name or allow passing it.
    this.name = options.name || 'azure-table-client';
  }

  setServiceProperties(xml: string): Promise<mixed> {
    return this.request(['', {
      method: 'PUT',
      body: xml,
      query: {
        restype: 'service',
        comp: 'properties',
      },
    }]);
  }

  setCorsRules(rules: Array<CorsRule>): Promise<mixed> {
    const cors = rules.map((rule) => {
      return `
        <CorsRule>
          <AllowedMethods>${rule.allowedMethods.join(',')}</AllowedMethods>
          <AllowedOrigins>${rule.allowedOrigins.join(',')}</AllowedOrigins>
          <AllowedHeaders>${rule.allowedHeaders.join(',')}</AllowedHeaders>
          <ExposedHeaders>${rule.exposedHeaders.join(',')}</ExposedHeaders>
          <MaxAgeInSeconds>${rule.maxAgeInSeconds}</MaxAgeInSeconds>
        </CorsRule>
      `;
    }).join('\n');

    const xml = `
      <?xml version="1.0" encoding="utf-8"?>
      <StorageServiceProperties>
        <Cors>
          ${cors}
        </Cors>
      </StorageServiceProperties>
    `.trim();

    return this.setServiceProperties(xml);
  }

  /**
   * Idempotent create table ...
   */
  async createTable(table: string): Promise<void> {
    try {
      await this.request(requestJSON('Tables', 'POST', {
        TableName: table,
      }));
    } catch (err) {
      if (extractErrorCode(err) === 'TableAlreadyExists') {
        return;
      }
      throw err;
    }
  }

  async queryTables(): Promise<{
    value: Array<{ TableName: string }>;
  }> {
    let res = await this.request(['Tables', {
      method: 'GET',
      headers: new Headers({
        'Accept': 'application/json;odata=nometadata',
      }),
    }]);

    return res.json();
  }

  /**
   * Formatted queryTables into a set.
   */
  async tables(): Promise<Set<string>> {
    let tables = await this.queryTables();
    invariant(Array.isArray(tables.value));
    return tables.value.reduce((result, value) => {
      result.add(value.TableName);
      return result;
    }, new Set());
  }

  /**
   * Idempotent delete table ...
   */
  async deleteTable(table: string): Promise<void> {
    let path = `Tables('${table}')`;

    try {
      await this.request([path, {
        method: 'DELETE',
        // This request has no body at this time ...
        headers: new Headers({
          'Content-Type': 'application/atom+xml',
        }),
      }]);
    } catch (err) {
      if (extractErrorCode(err) === 'ResourceNotFound') {
        return;
      }
      throw err;
    }
  }

  /**
   * @see http://msdn.microsoft.com/en-us/library/azure/dd179421.aspx
   */
  async getEntity(table: string, entity: Entity): Promise<Entity> {
    let path = formatSingleEntityPath(table, entity);
    let res = await this.request([path, {
      method: 'GET',
      headers: new Headers({
        // Fetch without any metadata ...
        'Accept': 'application/json;odata=nometadata',
      }),
    }]);
    let body = await res.json();
    body.ETag = res.headers.get('ETag');
    return body;
  }

  async deleteEntity(table: string, entity: Entity): Promise<void> {
    let path = formatSingleEntityPath(table, entity);
    invariant(typeof entity.ETag === 'string', 'entity must have etag for delete');
    await this.request([path, {
      method: 'DELETE',
      headers: new Headers({
        'If-Match': entity.ETag,
      }),
    }]);
  }

  /**
   * Begin an insert (POST) entity operation.
   * @see http://msdn.microsoft.com/en-us/library/azure/dd179421.aspx
   */
  async insertEntity(table: string, entity: Entity): Promise<Entity> {
    let [url, options] = requestJSON(table, 'POST', entity);
    invariant(options.headers);
    options.headers.set('Prefer', 'return-no-content');

    let res = await this.request([url, options]);
    if (res.status !== 204) {
      this._log(`Unexpected response ${res.status}`);
      throw new Error(`Unexpected reponse during insert.`);
    }

    return Object.assign({}, entity, {
      ETag: res.headers.get('ETag'),
    });
  }

  /**
   * Merge or insert an entity.
   */
  async mergeOrInsertEntity(table: string, entity: Entity): Promise<Entity> {
    let path = formatSingleEntityPath(table, entity);
    let res = await this.request(requestJSON(path, 'MERGE', entity));

    return Object.assign({}, entity, {
      ETag: res.headers.get('ETag'),
    });
  }

  /**
   * Query a subset of the table by partition key.
   */
  async query(
    table: string,
    filter?: string | Object,
    limit?: number,
    select?: Array<string>,
    // XXX: Could not get this to work with Array<Entity> flow shows:
    //
    // Promise. This type is incompatible with
    // <...>: declare function $await<T>(p: Promise<T> | T): T;
    //
  ): Promise<Array<any>> {
    let uri = `${table}()`;
    let query = {};

    if (filter) {
      if (typeof filter === 'object') {
        filter = tableFilter(filter);
      }
      query.$filter = filter;
    }

    if (limit) {
      query.$top = limit;
    }

    if (select) {
      query.$select = select.join(', ');
    }

    let res = await this.request([uri, {
      method: 'GET',
      query,
    }]);

    let body = await res.json();
    invariant(Array.isArray(body.value));
    return body.value;
  }
}
