/* @flow weak */
/**
 * Formats the given object converts mongodb style _id to .id.
 *
 * Mutates input!
 */
export default function formatOutput(record) {
  if (record && ('_id' in record)) {
    let id = record._id;
    delete record._id;
    record.id = id.toString();
  }

  // Explicitly return null so we can use results /w Joi validation.
  if (record === undefined) {
    return null;
  }

  return record;
}
