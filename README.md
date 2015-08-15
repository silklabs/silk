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
./node_modules/.bin/mocha <test>
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

#### `PUBLIC_URL`

Note if your testing from a device the server needs to know how it can be accessed from your network for video uploads. The simplest way of doing this is like this:

```sh
# 0.0.0.0 would instead be an ip reacahble by your device/browser/etc..
PUBLIC_URL=0.0.0.0:5000 npm start
```

Alternatively you can set this value in configuration (see: https://github.com/silklabs/silk-server/blob/master/config/default.js#L14)

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

## Silk API Automation

As part of our build process (when you push to master) we automatically
generate repositories for the api (or client) portion of silk-server:

  - https://github.com/silklabs/silk-api-react-native
  - https://github.com/silklabs/silk-api-node

These are generated from the build steps for each (see
[./build](./build/)) and the automation lives in
[./bin/publish-api](./bin/publish-api) the intention is to allow server
to control the source code and build process but make it easy to use
package.json to setup the api libraries in node/etc...

### Manually publishing

Running `./node_modules/.bin/babel-node ./bin/publish-api -h` will show
you all the help options and here is a quick example of publishing
react-native:

```sh
./bin/publish-api https://github.com/silklabs/silk-api-react-native react-native --gh-user lightsofapollo --gh-token "your-github-oauth-token"
```

When doing this manually it is also worthwhile looking at the diff
before pushing:

```sh
# Show the diff but do not push
./bin/publish-api https://github.com/silklabs/silk-api-react-native react-native --gh-user lightsofapollo --gh-token "your-github-oauth-token" --diff --dry-run
```

### Testing API changes locally in device/app

#### React-Native

When testing changes in react-native run:

```sh
# Builds the react-native api and overrides the current install in node_modules
./build/react-native/build.sh $WHERE_SILK_APP_LIVES/node_modules/silk-api-react-native
```

You will have to remove node_modules/silk-api-react-native to run `npm install` after this.

#### Device

```sh
# Builds the node api and overrides the current install in node_modules
./build/node/build.sh $WHERE_SILK_DEVICE_LIVES/vendor/silk/core/node_modules/silk-api
```

You will have to remove node_modules/silk-api-react-native to run `make sync` after this.

Note: You will need to rebuild core.js after running the above.

## Emacs setup

If you don't use emacs, ignore this.

JavaScript files are tagged to use js2-mode.  [Follow these instructions to install js2-mode](https://github.com/mooz/js2-mode).
