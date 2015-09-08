# Silk Web App [![Build Status](https://magnum.travis-ci.com/silklabs/silk-webapp.svg?token=j54FanpWeLbC7r1NyfJA)](https://magnum.travis-ci.com/silklabs/silk-webapp)
Silk app written for the web.

## Development environment

1. `npm` is used to manage source dependencies.
2. [webpack](https://webpack.github.io/) is used to bundle the application.
3. Locally host the application using either the [webpack dev
server](http://webpack.github.io/docs/webpack-dev-server.html) or the standalone
express HTTP server.

### Setup

```
npm install
```

If working with a local server create the file `public/config.local.js`
to override the default server URL:
```js
config = {
  serverUrl: 'http://localhost:5000'
}
```

### Iterative development

To start the webpack development server running on
[http://localhost:8080/](http://localhost:8080/) run
```
npm start
```
Any edits to `src/` should then be picked up automatically and rebuilt.  The
static content in `public/` maybe edited in place.

### Stand-alone HTTP server

A standalone express-based HTTP server is also provided at `server/`.  This
is used when hosting the app with Heroku.  It can be invoked locally as well by
running `npm run-script start-server`.  Typically using the webpack development
server will be more dev-friendly though.

## S3 Deployment

Upon merging a change Travis CI will deploy the application (`public/`) to the silk-webapp
bucket in S3.

* http://silk-webapp.s3-website-us-east-1.amazonaws.com/master/latest/
* http://silk-webapp.s3-website-us-east-1.amazonaws.com/next/latest/
* http://silk-webapp.s3-website-us-east-1.amazonaws.com/release/latest/
