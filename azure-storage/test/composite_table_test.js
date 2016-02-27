/* @flow */
import assert from 'assert';
import waitFor from 'silk-utils/wait_for';

import genTableName from './table_name';
import * as config from './config';
import {
  TableClient,
  SharedKeyAuth,
} from '../src/table';
import connectionString from '../src/connection_string';
import CompositeClient from '../src/composite_table';

suite('TableClient', function() {
  let primaryClient = new TableClient(new SharedKeyAuth(config.uswest));
  let secondaryClient = new TableClient(new SharedKeyAuth(config.useast));

  test('table operations', async () => {
    let table = genTableName();
    let comp = new CompositeClient(table, [
      primaryClient,
      secondaryClient
    ]);

    await comp.ensureTables();

    let primaryTables = await primaryClient.tables();
    let secondaryTables = await secondaryClient.tables();

    assert(primaryTables.has(table));
    assert(secondaryTables.has(table));

    let out = await comp.destroyTables();

    let primaryTablesDel = await primaryClient.tables();
    let secondaryTablesDel = await secondaryClient.tables();

    assert(!primaryTablesDel.has(table));
    assert(!secondaryTablesDel.has(table));
  });

  suite('entity operations', () => {
    let table = genTableName();
    let subject = new CompositeClient(table, [
      primaryClient,
      secondaryClient
    ]);

    suiteSetup(async () => {
      await subject.ensureTables(table);
    });

    suiteTeardown(async () => {
      await subject.destroyTables(table);
    });

    function buildEntity() {
      let rand = Math.floor(Math.random() * 10000);
      return {
        PartitionKey: 'xfoo',
        RowKey: String(rand + '-' + Date.now()),
        Value: 1
      };
    }

    test('merge / insert / delete', async () => {
      let entity = buildEntity();
      let insert = await subject.mergeOrInsertEntity(entity);

      // Wait until the secondary has been updated ...
      await waitFor({}, async () => {
        try {
          return await secondaryClient.getEntity(table, entity);
        } catch (err) {
          return false;
        }
      });

      let query = await subject.query({
        PartitionKey: entity.PartitionKey,
        RowKey: entity.RowKey,
      });
      assert.equal(query.length, 1);
      assert.equal(query[0].RowKey, entity.RowKey);
      assert.equal(query[0].PartitionKey, entity.PartitionKey);

      let get = await subject.getEntity(entity);
      assert.equal(get.PartitionKey, entity.PartitionKey);

      // Update the whole thing again ...
      let merge = await subject.mergeOrInsertEntity(Object.assign({}, entity, {
        Foo: 1
      }));
      assert(merge.ETag, 'passes ETag');
      assert(insert.ETag !== merge.ETag, 'changes etag');
    });
  });

});

