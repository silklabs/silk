# Silk Web App

Silk app written for the web

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

If working with a local server create the file `config.local.json` at the root
of the project to override the default server URL:
```json
{
  "serverUrl": "http://localhost:5000",
  "defaultUser": "e@silk.io",
  "defaultPassword": "raccoon"
}
```
Also demonstrated here a default username and password, used to simplify sign in
during development.

### Iterative development

To start the webpack development server running on
[http://localhost:8080/](http://localhost:8080/) run
```
npm start
```
Any edits to `src/` should then be picked up automatically and rebuilt.  The
static content in `public/` maybe edited in place.

Note that the webpack development server compiles and serves directly from
memory.

### Stand-alone HTTP server

A standalone express-based HTTP server is also provided at `server/`.  This
is used when hosting the app with Heroku.  It can be invoked locally as well by
running `npm run-script start-server`.  Typically using the webpack development
server will be more dev-friendly though.

### Logging

Logging is configured via `config.local.json` currently logging is based
on the `debug` module...

For example to enable all logs possible (socket.io, etc..):

```json
{
  "debug": "*"
}
```
