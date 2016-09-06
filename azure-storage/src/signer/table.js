/**
 * Shared access signatures based on this document:
 *
 * http://msdn.microsoft.com/en-us/library/windowsazure/dn140256.aspx
 * @flow
 */
import hmac from './hmac';
import invariant from 'assert';

export type Sas = {
  se: string;
  sv: string;
  sp: string;
  tn: string;
  sig: string;
  spk?: string;
  srk?: string;
  epk?: string;
  erk?: string;
};

type SasConfig = {
  table: string;
  expiration: string | Date;
  account: string;
  accessKey: string;
  signedVersion?: string;
  signedStart?: string | Date;
  signedPermissions?: string;
  signedIdentifier?: string;
  startPartitionKey?: string;
  startRowKey?: string;
  endPartitionKey?: string;
  endRowKey?: string;
};

type SharedKeyConfig = {
  method: string;
  table: string;
  headers: {[key: string]: string};
  query: {[key: string]: string};
  account?: string;
  accessKey?: string;
};

const OPTION_TO_QUERY_PARAM = {
  signedVersion: 'sv',
  signedResource: 'sr',
  table: 'tn',
  signedStart: 'st',
  expiration: 'se',
  signedPermissions: 'sp',
  signedIdentifier: 'si',
  cacheControl: 'rscc',
  contentDisposition: 'rscd',
  contentEncoding: 'rsce',
  contentLanguage: 'rscl',
  contentType: 'rsct',
  startPartitionKey: 'spk',
  startRowKey: 'srk',
  endPartitionKey: 'epk',
  endRowKey: 'erk',
};

const DATE_SAS_OPTIONS = [
  'signedStart',
  'expiration',
];

const DEFAULT_OPTIONS = {
  signedVersion: '2015-02-21',
  signedPermissions: 'r',
  accessKey: process.env.AZURE_STORAGE_ACCESS_KEY || '',
  account: process.env.AZURE_STORAGE_ACCOUNT || '',
};

function newlineValue(value: ?string): string {
  // intentional use of == null (null or undefined value)
  if (value === undefined || value === null) {
    return '\n';
  }
  return value + '\n';
}

function formatDate(date: Date): string {
  return date.toJSON().slice(0, -8) + 'Z';
}

/**
 * Build the query parameters from the options based on the OPTION_TO_QUERY_PARAM map.
 * @param {Object} options from service.
 * @return {Object} suitable for use as query parameters.
 */
function buildSasQuery(options: SasConfig): Object {
  let query = {};
  for (let key in options) {
    if (!options[key]) {
      continue;
    }
    if (!OPTION_TO_QUERY_PARAM[key]) {
      continue;
    }
    query[OPTION_TO_QUERY_PARAM[key]] = options[key];
  }
  return query;
}

/**
 * Shared access signature for azure services.
 */
export function sas(options: SasConfig): Sas {
  // fill in the default options
  options = Object.assign({}, DEFAULT_OPTIONS, options);

  // The table name _must_ be lowercased for the SAS signature otherwise this
  // will fail horribly. Table names are case insensitive.
  options.table = options.table.toLowerCase();

  options.signedStart = options.signedStart;
  if (!options.signedStart) {
    // Signed start is potentially tricky because we do not pass azure the
    // seconds... To account for any kind of weird drift or ntp problems we
    // subtract one whole minute from the start time so initial requests work
    // more reliably.
    let signedStart = new Date();
    signedStart.setMinutes(signedStart.getMinutes() - 1);
    options.signedStart = signedStart;
  }

  invariant(options.expiration);
  for (let key of DATE_SAS_OPTIONS) {
    if (key in options && options[key] instanceof Date) {
      options[key] = formatDate(options[key]);
    }
  }

  let queryParams = buildSasQuery(options);

  // build the signed value
  let stringToSign = '';

  stringToSign += newlineValue(options.signedPermissions);
  stringToSign += newlineValue(String(options.signedStart));
  stringToSign += newlineValue(String(options.expiration));
  stringToSign += newlineValue(
    '/table/' + options.account + '/' + options.table
  );
  stringToSign += newlineValue(options.signedIdentifier);
  stringToSign += newlineValue(options.signedVersion);
  stringToSign += newlineValue(options.startPartitionKey);
  stringToSign += newlineValue(options.startRowKey);
  stringToSign += newlineValue(options.endPartitionKey);
  stringToSign += options.endRowKey || '';

  queryParams.sig = hmac(options.accessKey, stringToSign);

  return queryParams;
}

/**
 * Build an authorization scheme based on the options for SharedKey.
 */
export function sharedKey(options: SharedKeyConfig): string {
  const accessKey = options.accessKey || DEFAULT_OPTIONS.accessKey;
  const account = options.account || DEFAULT_OPTIONS.account;

  invariant(accessKey);
  invariant(account);

  // http://msdn.microsoft.com/en-us/library/azure/dd179428.aspx
  let stringToSign = '';

  stringToSign += newlineValue(options.method);
  stringToSign += newlineValue(options.headers['Content-MD5']);
  stringToSign += newlineValue(options.headers['Content-Type']);
  stringToSign += newlineValue(options.headers['x-ms-date'] || options.headers.Date);
  stringToSign += '/' + account + '/' + options.table;

  if (options.query && options.query.comp) {
    stringToSign += `?comp=${options.query.comp}`;
  }

  const sig = hmac(accessKey, stringToSign);
  return 'SharedKey ' + account + ':' + sig;
}
