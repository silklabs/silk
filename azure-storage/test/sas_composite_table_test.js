/* @flow */
import assert from 'assert';
import assertAyncThrows from 'silk-utils/assert_async_throws';

import { sas } from '../src/signer/table';
import genTableName from './table_name';
import * as config from './config';
import {
  TableClient,
  SharedKeyAuth,
  SharedAccessTokenAuth,
} from '../src/table';
import connectionString from '../src/connection_string';
import CompositeClient from '../src/composite_table';
import SasCompositeClient from '../src/sas_composite_table';

suite('Sas Composite Client', function() {

  // Shared key clients ...
  let primaryClient = new TableClient(new SharedKeyAuth(config.uswest));
  let secondaryClient = new TableClient(new SharedKeyAuth(config.useast));

  let table, sharedComp;
  suiteSetup(async () => {
    table = genTableName();
    sharedComp = new CompositeClient(table, [
      primaryClient,
      secondaryClient
    ]);
    await sharedComp.ensureTables();
  });

  suiteTeardown(async () => {
    await sharedComp.destroyTables();
  });

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

  test('refreshing sas tokens', async () => {
    let attempt = 0;
    // The goal here is to exercise the case where we pull in an initial SAS
    // token which has expired then transparently fetch a new one.
    const subject = new SasCompositeClient(async () => {

      // during the first attempt return an expired sas token ...
      let offset;
      if (++attempt > 1) {
        offset = 60 * 1000;
      } else {
        offset = -10;
      }

      let expiration = new Date(Date.now() + offset);
      let signatures = [];

      for (let region in config) {
        let parsed = connectionString(config[region]);
        signatures.push([
          parsed.account,
          sas({
            account: parsed.account,
            accessKey: parsed.accessKey,
            table: table,
            expiration,
            signedPermissions: 'raud'
          })
        ]);
      }

      return signatures;
    });

    let rand = Math.floor(Math.random() * 10000);
    let PartitionKey = `part-${rand}`;
    let entity = {
      PartitionKey,
      RowKey: 'foobar'
    };

    // XXX: Sorta hacky ... Wait for first update clients to resolve ...
    await subject._updateClients();

    await subject.mergeOrInsertEntity(entity);
    assert.equal(attempt, 2);

    // run a few more updates ...
    await subject.mergeOrInsertEntity(entity);

    let result = await subject.query({
      PartitionKey: PartitionKey
    });
    assert.equal(result[0].PartitionKey, PartitionKey);

    // We have not requested new tokens since ours is still valid.
    assert.equal(attempt, 2);
  });

});


