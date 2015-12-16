import parse from '../../src/influxdb/parse';
import assert from 'assert';

suite('influxdb/deserialize', () => {

  test('parse complex metric', () => {
    let timestamp = '1442443737251000000';
    let series = 'foobarmagic';

    let metric = `${series},tag=value,tag\\ magic=1,bad\\,human=1 true=true,false=false,float=1.2,int=2,string="foo" ${timestamp}`;
    let result = parse(metric);

    assert.deepEqual(result, {
      series,
      tags: {
        tag: 'value',
        'tag magic': '1',
        'bad,human': '1'
      },
      values: {
        'true': true,
        'false': false,
        float: '1.2',
        int: 2,
        string: 'foo'
      },
      timestamp: new Date(parseInt(timestamp, 10) / 1000000)
    });
  });

  test('parse counter metric', () => {
    let metric = 'seriesonly';
    let result = parse(metric);
    assert.deepEqual(result, {
      series: metric,
      tags: {},
      values: {},
      timestamp: undefined
    });
  });

  test('parse value metric', () => {
    let metric = 'series value="yup"';
    let result = parse(metric);
    assert.deepEqual(result, {
      series: 'series',
      tags: {},
      values: { value: 'yup' },
      timestamp: undefined
    });
  });
});
