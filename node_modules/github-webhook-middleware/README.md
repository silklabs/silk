Github Webhook Middleware
=========================

This middleware parses a Github webhook and validates the signature as documented https://developer.github.com/webhooks/#payloads

You will need to set a secret when you create the webhook and pass the same secret as `options.secret` for validation.

The Github webhook payload will be accessible via `req.body`

Borrows ideas and code from https://github.com/developmentseed/jekyll-hook/ and https://github.com/rvagg/github-webhook-handler

## Installation

`npm install github-webhook-middleware --save`

## Usage

```javascript
var express = require('express');
var app     = express();
var githubMiddleware = require('github-webhook-middleware')({
  secret: process.env.GITHUB_SECRET
});

app.post('/hooks/github/', githubMiddleware, function(req, res) {
  // Only respond to github push events
  if (req.headers['x-github-event'] != 'push') return res.status(200).end();

  var payload = req.body
    , repo    = payload.repository.full_name
    , branch  = payload.ref.split('/').pop();
  
  var textFiles = getChangedFiles(payload.commits, /.*\.txt$/);
});


// The Github push event returns an array of commits.
// Each commit object has an array of added, modified and deleted files.
// getChangedFiles() returns a list of all the added and modified files
// excluding any files which are subsequently removed.
function getChangedFiles(commits, matchRegex) {
  return commits
    .reduce(function(previousCommit, currentCommit) {
      return previousCommit
        .concat(currentCommit.modified)
        .concat(currentCommit.added)
        .filter(function(value) {
          return currentCommit.removed.indexOf(value) === -1;
        });
    }, [])
    .filter(function(value, i, arr) {
      return arr.indexOf(value) >= i && matchRegex.test(value);
    });
}
```

## Contributing

Pull requests welcome. Needs tests.

## Release History

* 0.0.1 Initial release
