import eventToPromise from 'event-to-promise';

export default async function (app) {
  let http = app.listen(0);
  await eventToPromise(http, 'listening');
  return `http://localhost:${http.address().port}`;
}
