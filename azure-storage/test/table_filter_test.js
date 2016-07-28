/**
 * @flow
 */
import assert from 'assert';
import tableFilter from '../src/table_filter';

suite('table query', () => {

  // See https://msdn.microsoft.com/en-us/library/azure/dd894031.aspx
  const validate = [
    {
      name: 'Multiple operators on same property',
      input: [{
        LastName: {
          $gte: 'A',
          $lt: 'B',
        },
      }],
      expected: `
        LastName ge 'A' and LastName lt 'B'
      `.trim(),
    },

    {
      name: 'Simple or clauses',
      input: [{
        LastName: {
          $gte: 'A',
        },
        $or: [
          { FirstName: 'foo' },
          { Value: 1 },
        ],
      }],
      expected: `
        LastName ge 'A' and ((FirstName eq 'foo') or (Value eq 1))
      `.trim(),
    },

    {
      name: 'Complex or clauses',
      input: [{
        LastName: {
          $gte: 'A',
        },
        $or: [
          { FirstName: 'foo', Value: 2 },
          { FirstName: 'bar', Value: { $gte: 1 } },
        ],
      }],
      expected: `
        LastName ge 'A' and ((FirstName eq 'foo' and Value eq 2) or (FirstName eq 'bar' and Value ge 1))
      `.trim(),
    },

    {
      name: '$in operator',
      input: [{
        LastName: {
          $in: ['a', 'b'],
        },
      }],
      expected: `
        (LastName eq 'a' or LastName eq 'b')
      `.trim(),
    },

    {
      name: '$nin operator',
      input: [{
        LastName: {
          $nin: ['a', 'b'],
        },
      }],
      expected: `
        (LastName ne 'a' and LastName ne 'b')
      `.trim(),
    },
  ];

  for (let testCase of validate) {
    let {name, input, expected} = testCase;
    test(name, () => { // eslint-disable-line
      let result = tableFilter(...input);
      assert.equal(result, expected);
    });
  }

});
