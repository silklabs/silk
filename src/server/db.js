import mongo from 'promised-mongo';

/**
Given a config return a database connection.
*/
export default async function (config) {
  // XXX: this could and may be async in the future.
  return mongo(config.db.connectionString);
}
