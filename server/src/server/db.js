import { MongoClient, Logger } from 'mongodb';


/**
Given a config return a database connection.
*/
export default async function (config) {
  Logger.setLevel('info');
  // XXX: this could and may be async in the future.
  return MongoClient.connect(config.db.connectionString, {
    reconnectTries: Infinity,
  });
}
