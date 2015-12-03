/**
 * Travis convenience helpers.
 */
import Travis from 'travis-ci';
import cb2promise from 'promise-callback';
import request from 'request-promise';
import createLog from 'log';

const log = createLog('travis');

type TravisBuildRequest = {
  message?: string;
  branch?: string;
  config?: {[key: string]: any};
};
type TravisBuildResponse = {[key: string]: any};

let _travisPromise = null;
async function _genAuthTravis(): Promise<Travis> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable undefined');
  }
  log.info('Travis not initialized yet. Authenticating...');
  let travis = new Travis({
    version: '2.0.0',
    pro: true,
  });
  let auth = await cb2promise(travis.authenticate.bind(travis), {
    github_token: process.env.GITHUB_TOKEN,
  });
  log.debug('Authenticated with Travis:', auth);

  // Short-circuit all subsequent calls to genTravis().
  _travisPromise = Promise.resolve(travis);

  return travis;
}

/**
 * Returns an authenticated Travis instance.
 */
export function genTravis(): Promise<Travis> {
  // First time around we need to create and authenticate the Travis instance.
  // We only want to do that once, so the promise representing that action is
  // stored as a singleton and potentially returned multiple times. Once
  // we have authenticated, the promise will be replaced for another singleton
  // promise.
  if (_travisPromise === null) {
    _travisPromise = _genAuthTravis();
  }
  return _travisPromise;
}

/**
 * Triggers a Travis build for the specified repo.
 */
export async function triggerBuild(
  owner: string,
  repo: string,
  build_request: TravisBuildRequest
): Promise<TravisBuildResponse> {
  let travis = await genTravis();
  let accessToken = travis.agent._getAccessToken();
  if (!accessToken) {
    throw new Error('Travis access token is not available!');
  }

  log.info(`Triggering ${owner}/${repo}: ${build_request.message}`);
  return await request({
    url: 'https://api.travis-ci.com/repo/' + owner + '%2F' + repo + '/requests',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Travis-API-Version': '3',
      'Authorization': 'token ' + accessToken,
    },
    json: true,
    body: { request: build_request },
  });
}
