//
// Triggers the Travis CI jobs that update the silk-device repocache tarballs on
// S3
//
import Travis from 'travis-ci';
import cb2promise from 'promise-callback';
import rp from 'request-promise';

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable undefined');
}


function triggerBuild(access_token, GONK, linuxOnly) {

  let owner = 'silklabs';
  let repo = 'releng';
  let branch = 'master';
  let message = 'Updating repocache for ' + GONK + ' gonk';

  let script = './travis/script_repocache';

  let os = [ 'osx', 'linux' ];
  if (linuxOnly) {
    os = [ 'linux' ];
  }

  let global = {
    DEPLOY: 'true',
    GONK
  };

  return rp({
    url: 'https://api.travis-ci.com/repo/' + owner + '%2F' + repo + '/requests',
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Travis-API-Version': '3',
      'Authorization': 'token ' + access_token
    },
    json: true,
    body: {
      request: {
        message,
        branch,
        config: {
          os,
          env: { global },
          script
        }
      }
    }
  });

}


let travis = new Travis({version: '2.0.0', pro: true});
cb2promise(travis.auth.github.post, {
  github_token: process.env.GITHUB_TOKEN
})
.then(res => {
  console.log('Travis auth:', res);

  return Promise.resolve()
  .then(() => triggerBuild(res.access_token, 'base', false))
  .then(() => triggerBuild(res.access_token, 'mako', true))
  .then(() => triggerBuild(res.access_token, 'qemu', true));

})
.then(() => {
  console.log('SUCCESS');
})
.catch(err => {
  console.error(err);
  process.exit(1); //eslint-disable-line no-process-exit
});

