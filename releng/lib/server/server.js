/**
 * @flow
 */

import createLog from 'silk-log';
import eventToPromise from 'event-to-promise';
import makeGithubMiddleware from 'github-webhook-middleware';
import bodyParser from 'body-parser';

import * as githubTravisIntegration from '../github-travis-integration.js';
import makeTravisMiddleware from './travis-webhook-middleware';
import * as githubEvent from './github-event';
import {
  getContext as getGitlabContext,
  triggerBuild as triggerGitlabBuild,
} from './gitlab-event';

export default async function main(config: Object) {
  const log = createLog('server');
  let express = require('express');
  let app = express();
  let http = require('http').createServer(app);
  let path = require('path');

  let publicPath = path.join(__dirname, '/../../public');

  log.info('binding to port', config.server.port);
  log.info('__dirname is', __dirname);
  log.info('cwd is', process.cwd());
  log.info('serving static files from', publicPath);

  app.set('port', config.server.port);
  app.use(express.static(publicPath));

  let githubMiddleware = makeGithubMiddleware({
    secret: process.env.GITHUB_SECRET || 'mousenuts',
    limit: '10mb', // Allow really big payloads (ie, release commits)
  });
  app.post('/hooks/github/', githubMiddleware, (req, res) => {

    let event = req.headers['x-github-event'];
    switch (event) {
    case 'pull_request':
      githubEvent.pullrequest(req.body);
      break;
    case 'push':
      githubEvent.push(req.body);
      break;
    case 'status':
      githubEvent.status(req.body);
      break;
    default:
      log.error(`Unhandled event: ${event}`);
      break;
    }
    res.status(200).end();
  });

  let travisMiddleware = makeTravisMiddleware({
    getUserToken: (slug) => process.env.TRAVIS_USER_TOKEN || 'whiskynuts',
  });
  app.post('/hooks/travis/', travisMiddleware, (req, res) => {
    let payload = req.body.payload;
    if (!payload) {
      throw new Error(`No 'payload' parameter found in request body!`);
    }
    let json = JSON.parse(payload);
    githubTravisIntegration.handleTravisWebhook(json)
      .catch(err => log.error('Error', err.stack));
    res.status(200).end();
  });

  const gitlabContext = await getGitlabContext();
  app.post('/hooks/gitlab', bodyParser.json(), (req, res) => {
    triggerGitlabBuild(req.body, gitlabContext);
    res.status(200).end();
  });

  http.listen(config.server.port);
  let errorEvent = eventToPromise(http, 'error').then(err => {
    throw err;
  });

  let connected = eventToPromise(http, 'listening');

  // await to be connected correctly...
  await Promise.race([errorEvent, connected]);

  // This interface is only ever supposed to be used from tests.
  return {
    // Useful because tests bind on 0 we don't know which port we are using
    // until this is done.
    port: http.address().port,

    // Do any cleanup here that would normally happen because of the server
    // process being killed. We do this instead of closing the process mostly
    // for performance.
    close: async() => {
      http.close();
    },
  };
}
