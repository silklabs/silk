/**
 * Azure connection string parser.
 *
 * @flow
 */
import invariant from 'assert';

export type ConnectionString = {
  protocol: string;
  account: string;
  accessKey: string;
  blobEndpoint: string;
  tableEndpoint: string;
  queueEndpoint: string;
  fileEndpoint: string;
};

export default function (input: string): ConnectionString {
  let parts = input.split(';');
  let objectRepr = {};

  for (let part of parts) {
    let splitIdx = part.indexOf('=');
    if (splitIdx === -1) {
      throw new Error('Malformed connection string');
    }
    let name = part.slice(0, splitIdx);
    let value = part.slice(splitIdx + 1);
    objectRepr[name] = value;
  }

  // Ensure vital fields are present.
  invariant(objectRepr.AccountName);
  invariant(objectRepr.AccountKey);
  invariant(objectRepr.BlobEndpoint);
  invariant(objectRepr.TableEndpoint);
  invariant(objectRepr.QueueEndpoint);
  invariant(objectRepr.FileEndpoint);

  return {
    protocol: objectRepr.DefaultEndpointsProtocol,
    account: objectRepr.AccountName,
    accessKey: objectRepr.AccountKey,
    blobEndpoint: objectRepr.BlobEndpoint,
    tableEndpoint: objectRepr.TableEndpoint,
    queueEndpoint: objectRepr.QueueEndpoint,
    fileEndpoint: objectRepr.FileEndpoint,
  };
}
