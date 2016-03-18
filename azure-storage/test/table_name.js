/* @flow */
import uuid from 'uuid';

/**
 * Generate a table name for testing.
 */
export default function (): string {
  return new Buffer(String(uuid.v4())).toString('base64');
}
