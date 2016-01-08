/* @flow */
import createContext from 'silk-server/test/server/context';
import {Metric, Float} from '../src/';
import uuid from 'uuid';
import assert from 'assert';

suite('metrics agent', function() {

  if (!process.env.INFLUX_CONNECTION_STRING) {
    test.skip(`INFLUX_CONNECTION_STRING is required to run these tests...`);
    return;
  }


  let context = createContext();
  let account;
  setup(async () => {
    account = await context.testAccount();
  });

  type CpuMetricProps = {
    server: string;
    load: Float;
  };

  class CpuMetric extends Metric {
    static NAME = `${uuid.v4().replace(/-/g, '')}`;
    static DESC = 'cpu metrics for tests...';
    static INDEX = new Set(['server']);

    properties: CpuMetricProps;

    constructor(props: CpuMetricProps) {
      super(props);
    }
  }

  test('submit metrics', async () => {
    account.api.accountMetrics.add([
      new CpuMetric({
        server: '1',
        load: new Float(0.7),
      }),
      new CpuMetric({
        server: '2',
        load: new Float(0.7),
      }),
    ]);

    await account.api.accountMetrics.submit();

    let {results} = await account.api.account.queryMetrics({
      // XXX: Remember that we prefix the series with the metric submitter type.
      query: `SELECT * FROM account_${CpuMetric.NAME}`
    });

    let values = results[0].series[0].values;
    assert.equal(values.length, 2);
  });

});
