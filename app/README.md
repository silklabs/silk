# Silk App

## Prerequisites

The Silk app is written with React Native.  To install the toolchain necessary for React Native development, [see the React Native Getting Started docs](https://facebook.github.io/react-native/docs/getting-started.html).

If you're developing on OS X, you will also need to install the GNU coreutils:
```sh
brew install coreutils
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
`config.local.json` in the repository root.  Also set `showDevServers`
to easily move between internal development servers:

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

### Profiling

The app can be profiled using the systrace integration available from React Native. You'll need the latest version of the `trace2html` command line tool as a prerequisite, installed in the normal search paths for the packager (e.g. `/usr/local/bin`). On OS X, you can use Homebrew to install it.

First run
```sh
$ brew edit trace2html
```
Replace the entire formula with [this updated formula](https://gist.github.com/ndfred/ffef3b31b8d9034a160e6eff6b4b37ea), save and close, and then run
```sh
$ brew install trace2html
```

Then start the packager normally and run a Debug build on your device. Invoke the developer menu (shaking on iOS, menu button on Android) and start systrace profiling from there. Once you've performed the actions you want to profile, stop systrace profiling from the same menu. React Native will automatically upload the profiling data to the packager, which will run `trace2html` on the data and open the resulting HTML file in a browser (currently only Chrome is supported.)

## iOS

### Setting up a development environment

First install and build the module dependencies:
```
./install.sh
```

To run and develop the app, open `ios/Silk.xcodeproj` in Xcode.  You can do most development in the iOS simulators.  A physical device is only required for Bluetooth development, performance testing, and touch-tap testing.

### Development cycle

React Native supports two development modes:

0. Fetch resources from external server (save-reload mode from host)
0. Package resources into app package (deploy-to-device mode)

#### Packaged JS bundle

By default, the app is configured for deploy-to-device mode.  In this mode, whenever you change a Javascript file, the JS bundle that's packaged with the app needs to be rebuilt. XCode will do this automatically each time the app is (re-)run on device.

#### JS bundle loaded from remote packager server

However, if you find yourself rebuilding and redeploying the app frequently in your dev cycle, then you might want to consider loading the JS bundle from a local server rather than packaging it with the app.  To do so, start the JS packaging server with `npm start` and add the following stanza to `config.local.json` in the repository root (you'll have to create the file if it doesn't exist yet) before you run the app:

```js
{
  "react-native": {
    "type": "remote",
    "host": "<your IP address, defaults to localhost>"
  }
}
```

If you're running the app in the simulator, you can use `localhost` for the host (or leave it out). Use Cmd+R in the simulator to reload the JS whenever you've made changes without having to re-run in Xcode. If you're running the app on a real device, you'll have to make sure that that device is on the same network as your computer, and you'll have to use your computer's IP address in the URL. Shake the device and pick "Reload JS" from the menu that appears whenever you want to reload the JavaScript code.

#### Hybrid approach: packaged JS bundle generated from packager server

It may not always be convenient or possible to have the app load its JS bundle from the packager server on your computer. However, re-generating the entire bundle each time you re-run the app takes a long time, and makes testing changes to the JS code impossible to do rapidly. To solve this problem, you can start the JS packaging server with `npm start` and configure the app to generate a bundle each time you run it, but generate it from that server:

```js
{
  "react-native": {
    "type": "local"
  }
}
```

By leaving an instance of the packager server running and using it to generate updated bundles, subsequent re-runs of the app will be able to generate a packaged bundle much more quickly.

## Android

### Setting up a development environment

First install and build the module dependencies:
```sh
./install.sh
```

For developing the native Java part of the app, any Android-capable IDE will work. Android Studio works very well as it can import the Gradle configuration as a project. Just point it at `android/build.gradle`.

### Development cycle

Start the packaging server like on iOS:
```sh
npm start
```

Build, install, and run the Android app on a connected Android phone or emulator:
```sh
react-native run-android
```

You can also call the `gradle` script manually, e.g. if you need to debug the build:
```sh
cd android
./gradlew installDebug --debug
```

#### Video player webview

Video playback on Android is handled by using the MSE player inside a Webview. Normally the JS for the Webview is generated at build time and shipped as part of the Android APK as an asset file. But it's also possible to load it on the fly so that changes to any files are picked up instantly without the need for a whole Android app rebuild. Start the Webpack dev server serving the relevant files like so:
```
npm run webview-dev-server
```
and tell the app to load the Webview contents from the Webpack dev server rather than the assset file in the APK by adding the following to `config.local.json`:
```json
{
  "mseWebviewUrl": "http://192.168.1.13:8000/mse.html"
}
```

### Updating internal node_module folders ...

NOTE: `npm dedupe` will result in a wildy different tree that is roughly
the same size (when using npm3 which is required). Avoid it.

1. Update package.json and run `../node_modules/.bin/npm install`
   May also do something like `../node_modules/.bin/npm install <x> --save`.
   This will use the in-tree npm.
2. Run npm postinstall to ensure patches are applied
3. Verify that no new native modules where added by running `find node_modules -name 'binding.gyp'`
   then ensuring that modules with binding.gyp have a statement in the git ignore for the `build` directory (sometimes also lib)
4. Check in `node_modules.`
