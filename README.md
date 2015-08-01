# silk-server [![Build Status](https://magnum.travis-ci.com/silklabs/silk-server.svg?token=9zqxLJky1XFHahNndToB&branch=master)](https://magnum.travis-ci.com/silklabs/silk-server)

This is the main silk server.

## Install

You need the following:

  - node 0.12
  - mongodb

### Installing mongodb

On OSX:

```sh
brew install mongodb
# ... follow instructions
```

On Linux:

It's usually a mongodb package or mongodb-server package.

## Usage

To translate the source files:
```bash
npm install
```

To run the test suite:
```bash
npm test
```

Run single test file:
```bash
./node_modules/.bin/mocha --harmony <test>
```

### Test locally

Ensure that mongodb is [configured](http://docs.mongodb.org/manual/tutorial/install-mongodb-on-os-x/#run-mongodb).  Start the daemon with
```
mongod
```

The following command starts a silk server on localhost:5000 (by default):
```
npm start
```
Load http://localhost:5000 in your web browser to ensure that the server is running.  Devices and apps can connect to that server instance.

## Configuration

See [./config/default.js](the default configuration file) for all
available configuration options. Config files are loaded in this order:

  - 1. [./config/default.js]
  - 2. ./config/<profile>
  - 3. config.local.js

Each configuration file is deeply merged into the previous (so profile
overrides default, etc...).

#### `config.local.js`

This special configuration file lives in the root of your tree and
allows you to globally override any configuration. This is intended to
be used for local development only. If you need a new type of
deployment create a new configuration profile.

## Emacs setup

If you don't use emacs, ignore this.

JavaScript files are tagged to use js2-mode.  [Follow these instructions to install js2-mode](https://github.com/mooz/js2-mode).
