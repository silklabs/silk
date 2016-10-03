/**
 * Query interface and parser based on MongoDB query language.
 *
 * NOTE: We make little to no effort to "sanitize" inputs here ... The primary
 * means of security should be outside of this helper and/or in SAS tokens.
 *
 * @flow
 */

import invariant from 'assert';

type QueryProps = {
  $in?: Array<mixed>;
  $nin?: Array<mixed>;
};

type Query = {
  $or?: Array<Query>;
} | QueryProps;

// Allowed operators used in our queries.
const PROP_OPERATORS = new Set([
  '$eq',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$ne',
  '$nin',
  '$in',
]);

// Azure mapping of operators ...
const PROP_OPERATORS_TO_AZURE = {
  '$eq': 'eq',
  '$gt': 'gt',
  '$gte': 'ge',
  '$lt': 'lt',
  '$lte': 'le',
  '$ne': 'ne',
};

function castValue(value: mixed): boolean | string | number {
  switch (typeof value) {
  case 'string':
    return `'${value}'`;
  case 'number':
    return value;
  case 'boolean':
    return value;
  default:
    throw new Error(`Unhandled JS type: '${typeof value}'`);
  }
}

function normalizeArrayOperatorCall(
  property: string,
  values: Array<mixed>,
  operator: string,
  join: string
): Array<string> {
  invariant(Array.isArray(values));

  let clause = [];
  for (let value of values) {
    clause.push(`${property} ${operator} ${String(castValue(value))}`);
  }

  return [`(${clause.join(join)})`];
}

function normalizeOperatorCall(
  operator: string,
  property: string,
  value: mixed,
): Array<string> {

  if (operator in PROP_OPERATORS_TO_AZURE) {
    let azureOp = PROP_OPERATORS_TO_AZURE[operator];
    return [`${property} ${azureOp} ${String(castValue(value))}`];
  }

  if (operator === '$in') {
    invariant(Array.isArray(value));
    return normalizeArrayOperatorCall(
      property,
      value,
      'eq',
      ' or '
    );
  }

  if (operator === '$nin') {
    invariant(Array.isArray(value));
    return normalizeArrayOperatorCall(
      property,
      value,
      'ne',
      ' and '
    );
  }

  throw new Error(`Not implemented: ${operator}`);
}

function normalizeQueryValue(property: string, input: mixed): Array<string> {
  // Allow date queries but format them into a string.
  if (input instanceof Date) {
    input = input.toJSON();
  }

  if (typeof input !== 'object') {
    return normalizeOperatorCall('$eq', property, input);
  }

  invariant(input);
  let result = [];
  for (let op of PROP_OPERATORS) {
    if (op in input) {
      result.push(...normalizeOperatorCall(op, property, input[op]));
    }
  }

  return result;
}

// See https://docs.mongodb.org/manual/reference/operator/query/or/#op._S_or
function parseOrClause(statements: Array<Query>): string {
  let subclauses = [];
  for (let query of statements) {
    let clause = [];
    for (let prop in query) {
      let value = query[prop];
      clause.push(...normalizeQueryValue(prop, value));
    }
    subclauses.push(`(${clause.join(' and ')})`);
  }
  return `(${subclauses.join(' or ')})`;
}

export default function parseQuery(
  query: Query,
): string {
  // Simple and support .....
  let clause = [];
  for (let prop in query) {
    let result;
    if (prop === '$or') {
      invariant(Array.isArray(query.$or));
      // $FlowFixMe: having a hard time convincing Flow what type query.$or is.
      result = [parseOrClause(query.$or)];
    } else {
      result = normalizeQueryValue(prop, query[prop]);
    }
    clause.push(...result);
  }

  return clause.join(' and ');
}
