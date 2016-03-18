/* @flow */
import assert from 'assert';

import { uswest as config } from './config';
import genTableName from './table_name';
import { sas } from '../src/signer/table';
import connectionString from '../src/connection_string';
import {
  TableClient,
  SharedKeyAuth,
  SharedAccessTokenAuth,
} from '../src/table';

import type { Entity } from '../src/table';

suite('TableClient', function() {
  let sharedClient = new TableClient(new SharedKeyAuth(config));

  function sasClient(connection, sasConfig) {
    let parsed = connectionString(connection);
    let sasInput = sas(Object.assign(
      {},
      { account: parsed.account, accessKey: parsed.accessKey },
      sasConfig,
    ));
    let auth = new SharedAccessTokenAuth(parsed.account, sasInput);
    return new TableClient(auth);
  }

  test('query / add / remove tables', async () => {
    // Encode the values to make azure table happy ...
    let table = genTableName();
    await sharedClient.createTable(table);
    // Should not throw on a second create ...
    await sharedClient.createTable(table);
    let tables = await sharedClient.tables();
    assert.ok(tables.has(table));
    await sharedClient.deleteTable(table);
    await sharedClient.deleteTable(table);
    let tablesAfterDel = await sharedClient.tables();
    assert.ok(!tablesAfterDel.has(table));
  });

  suite('entity operations', () => {
    let table = genTableName();
    let expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 10);

    let sasAll = sasClient(config, {
      table,
      signedPermissions: 'raud',
      expiration: expiry,
    });

    let sasRead = sasClient(config, {
      table,
      signedPermissions: 'r',
      expiration: expiry,
    });

    suiteSetup(async () => {
      await sharedClient.createTable(table);
    });

    suiteTeardown(async () => {
      await sharedClient.deleteTable(table);
    });

    // Limit each "buildEntity" per setup to use the same PartitionKey.
    let PartitionKey;
    setup(() => {
      let rand = Math.floor(Math.random() * 10000);
      PartitionKey = `part-${rand}`;
    });

    function buildEntity(input?: {[key: string]: any}): Entity {
      let rand = Math.floor(Math.random() * 10000);
      return Object.assign({}, {
        PartitionKey,
        RowKey: String(rand + '-' + Date.now()),
        Value: 1,
      }, input || {});
    }

    [
      ['Shared Key', sharedClient],
      ['SAS Token', sasAll],
    ].forEach((fixture) => {
      let [title, client] = fixture;
      test(`${title} insert/get/delete entity`, async () => {
        let entity = buildEntity();
        let insert = await client.insertEntity(table, entity);
        assert.ok(insert.ETag, 'insert contains etag');
        let fetchedEntity = await client.getEntity(table, entity);
        assert.equal(fetchedEntity.ETag, insert.ETag);
        for (let key in entity) {
          assert.equal(fetchedEntity[key], entity[key]);
        }

        let query = await client.query(
          table,
          `PartitionKey eq '${entity.PartitionKey}' and RowKey eq '${entity.RowKey}'`,
          1
        );
        assert.equal(query.length, 1);
        assert.equal(query[0].RowKey, entity.RowKey);

        await client.deleteEntity(table, fetchedEntity);
        try {
          await client.getEntity(table, entity);
        } catch (err) {
          assert.equal(err.status, 404);
          return;
        }
        throw new Error(`Should throw a 404 error after entity delete`);
      });

      test(`${title} advanced queries`, async () => {
        let entityA = buildEntity({ special: 'yay' });
        let entityB = buildEntity({ special: 'boo' });
        let entityC = buildEntity();

        await Promise.all([
          client.mergeOrInsertEntity(table, entityA),
          client.mergeOrInsertEntity(table, entityB),
          client.mergeOrInsertEntity(table, entityC),
        ]);

        let query = {
          PartitionKey,
          Value: 1,
          special: {
            $in: ['yay', 'boo'],
          },
        };

        let res = await client.query(table, query);
        assert.equal(res.length, 2);

        let specials = res.map(value => value.special);
        assert.deepEqual(specials.sort(), ['boo', 'yay']);

        let PartitionKeys = res.map(value => value.PartitionKey);
        assert.deepEqual(PartitionKeys, [PartitionKey, PartitionKey]);
      });

      test(`${title} mergeOrInsertEntity`, async () => {
        let entity = buildEntity();
        let insert = await client.mergeOrInsertEntity(table, entity);
        let merge = await client.mergeOrInsertEntity(table, Object.assign({}, entity, {
          Foo: 1,
        }));

        assert(merge.ETag, 'passes ETag');
        assert(insert.ETag !== merge.ETag, 'changes etag');
      });

    });

    test('sas permissions', async () => {
      let entity = buildEntity();
      let insert = await sharedClient.insertEntity(table, entity);

      await sasRead.getEntity(table, insert);

      // The SAS client should have no trouble reading but should be unable to
      // update or insert anything ...
      try {
        await sasRead.mergeOrInsertEntity(table, insert);
      } catch (err) {
        assert.equal(err.status, 404);
        return;
      }
      throw new Error('Read only client can update!');
    });

  });

});
