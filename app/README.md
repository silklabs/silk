# Silk App

The Silk app is written with React Native.  To install the React Native toolchain, [see these instructions](http://facebook.github.io/react-native/docs/getting-started.html#content).

## Installing and running the app

First install the module dependencies:
```
npm install
```

## General notes

### Lint and Flow

Coding style and static type checking (on a per-file opt-in basis) are enforced by CI. You can run the linter and type checker locally with the following commands:

```sh
npm run lint
npm run flow
```

Or in one go:

```sh
npm run test
```

### Default User, Password, Server URL

A default username, password, server URL can be configured via
`config.local.json`.  Also set `showDevServers` to easily move between
internal development servers:

```js
{
  "showDevServers": true,
  "serverUrl": "",         <-- Empty string means 'default' server for current branch
  "defaultEmail": "stooge@silklabs.com",
  "defaultPassword": "supersekrit"
}
```

### Logging

Logging is configured via `config.local.json` currently logging is based
on the `debug` module...

For example to enable all logs possible (socket.io, etc..):

```json
{
  "debug": "*"
}
```

## iOS

### Setting up a development environment

**BEFORE OPENING THE PROJECT IN XCODE**, install the npm module dependencies:
```
npm install
```

To develop the app, open `ios/Silk.xcodeproj` in Xcode.  You can do most development in the iOS simulators.  A physical device is only required for Bluetooth development, performance testing, and touch-tap testing.

### Development cycle

React Native supports two development modes:

0. Fetch resources from external server (save-reload mode from host)
0. Package resources into app package (deploy-to-device mode)

#### Packaged JS bundle

By default, the app is configured for deploy-to-device mode.  In this mode, whenever you change a Javascript file, the JS bundle that's packaged with the app needs to be rebuilt. XCode will do this automatically each time the app is (re-)run on device.

#### JS bundle loaded from remote packager server

However, if you find yourself rebuilding and redeploying the app frequently in your dev cycle, then you might want to consider loading the JS bundle from a local server rather than packaging it with the app.  To do so, start the JS packaging server with `npm start` and add the following stanza to `config.local.json` in the `app/` directory (you'll have to create the file if it doesn't exist yet) before you run the app:

```js
{
  "react-native": {
    "type": "remote",
    "url": "http://<your computer's IP address>:8082/index.ios.bundle?platform=ios&dev=true"
  }
}
```

If you're running the app in the simulator, you can use `localhost` for your computer's IP address. Use Cmd+R in the simulator to reload the JS whenever you've made changes without having to re-run in Xcode. If you're running the app on a real device, you'll have to make sure that that device is on the same network as your computer, and you'll have to use your computer's IP address in the URL. Shake the device and pick "Reload JS" from the menu that appears whenever you want to reload the JavaScript code.

#### Hybrid approach: packaged JS bundle generated from packager server

It may not always be convenient or possible to have the app load its JS bundle from the packager server on your computer. However, re-generating the entire bundle each time you re-run the app takes a long time, and makes testing changes to the JS code impossible to do rapidly. To solve this problem, you can start the JS packaging server with `npm start` and configure the app to generate a bundle each time you run it, but generate it from that server:

```js
{
  "react-native": {
    "type": "local",
    "url": "http://localhost:8082/index.ios.bundle?platform=ios&dev=true"
  }
}
```

By leaving an instance of the packager server running and using it to generate updated bundles, subsequent re-runs of the app will be able to generate a packaged bundle much more quickly.

## Android

### Setting up a development environment

Ensure that you have installed everything needed for React Native for Android development, as [outlined by the React Native documentation](https://facebook.github.io/react-native/docs/android-setup.html).

As with iOS, before you can perform any further steps, ensure you have installed the npm module dependencies via:
```
npm install
```

The Android app also pulls in some code from the webapp, so before proceeding, you'll want to build the webapp as well:
```
cd ../webapp
npm install
```

For developing the native Java part of the app, any Android-capable IDE will work well. Android Studio can import the Gradle configuration as a project, just point it at `android/build.gradle`.

### Development cycle

Start the packaging server like on iOS, optionally telling webpack not to build iOS bundles for quicker startup:
```
npm start -- --no-ios
```

Build, install, and run the Android app on a connected Android phone or emulator:
```
react-native run-android
```

#### Video player webview

Normally 

```json
{
  "mseWebviewUrl": "http://192.168.1.13:8000/js/android"
}
```
