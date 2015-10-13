# Silk App [![Build Status](https://magnum.travis-ci.com/silklabs/silk-app.svg?token=j54FanpWeLbC7r1NyfJA)](https://magnum.travis-ci.com/silklabs/silk-app)

Silk app written for react-native.  To install the react-native toolchain, [see these instructions](http://facebook.github.io/react-native/docs/getting-started.html#content).

## Installing and running the app

First install the module dependencies:
```
npm install
```

With a provisioned device (see below) connected to the computer via USB, you can download and install the latest build of the app via the following command:
```
npm run update
```

It is also possible to specify a branch, e.g.:
```
npm run update -- next
```

## Provisioning an iDevice

Currently the Silk App is optimized for the iPhone 5s / iPod Touch 5th gen screen resolution.  iPod Touch 5 devices are good for development because they're relatively cheap.  To provision a new device:

0. Connect the device to iTunes and ensure it's updated to latest iOS.
0. Sign in to https://developer.apple.com with an Apple ID that's a member of the Silk Labs development team.
0. Navigate to "Certificates, Identifiers & Profiles" -> iOS section -> Devices.
0. Click "+" icon at top-right to add a new device.
0. Open iTunes and find the "Serial Number" list for your device.  Click this once to switch the disply to "UDID".  Right-click the UDID and copy it.
0. Paste the UDID you copied into the developer.apple.com add-device UI.  Give your device a memorable name and click "Continue", then "Register".

If you're planning to develop on this device:

0. Open Xcode.  Ensure your Apple ID account has been set up in Xcode.
0. In the top-left of Xcode UI, choose your iDevice in the drop-down menu to set it as the build/run target.
0. Press Ctrl-r to run Silk App on your iDevice.  In the 'Failed to code sign "Silk"' dialog box that pops up, press the "Fix Issue" button.

Xcode should then set up your device and launch the Silk App on your device.  You're done!

In order to be able to install builds from Travis on the new device, the provisioning profile called "CI Build Profile" needs to be updated to include the new device. This can be done through [Apple's Developer center](https://developer.apple.com/account/ios/profile/profileList.action). Once updated, download the provisioning profile, place it in `.travis/certs`, and check in the new profile so that Travis builds will include it from there on out.

## Setting up a development environment

**BEFORE OPENING THE PROJECT IN XCODE**, install the module dependencies in your clone dir
```
npm install
```

To develop the app, open `Silk.xcodeproj` in Xcode.  You'll want to do most development in the (excellent!) iOS simulator(s).  Only for Bluetooth development, performance testing, and touch-tap testing, a physical device is required.  Choose a simulator target at the top-left of the xcode UI.  Currently, silk app targets iPhone 5s.  Press Ctrl-r to build and run the application in the simulator.

## Development cycle

react-native supports two development modes:

0. Fetch resources from external server (save-reload mode from host)
0. Package resources into app package (deploy-to-device mode)

By default, silk-app is configured for deploy-to-device mode.  In this mode, whenever you change a react-native .js file, you must rebuild the JS bundle that's built into the app. This is done each time you build and redeploy the app by pressing Ctrl-r from within Xcode.

However, if you find yourself rebuilding and redeploying the app frequently in your dev cycle, then you probably want to switch to save-reload mode.  To do so, add `config.local.json` to the root of `silk-app`.

The most basic version looks like this:

```js
{
  "react-native": {
    "type": "remote",
    "url": "http://localhost:8082/index.ios.bundle"
  },

  // You may also pass a config to override the default silk-server instance.
  "server": {
    "url": "http://localhost:5000"
  }
}
```

When rapidly deploying new changes to the phone using the bundle is the
best option (you do not need to figure out your public ip). There is a
special mode in the build system where we hit an existing bundle server
to speed this process up:

```
# Ensure server is running...
npm start
```

(Configure bundle to hit an existing server)

```js
{
  "react-native": {
    "type": "bundle",
    "local": {
      "url": "http://localhost:8082/index.ios.bundle"
    }
  }
}
```


See: [The config file](./Libraries/Config) for all options.

In addition to the config file you must ensure you have `watchman`
installed:

```sh
brew install watchman
```

Then run:

```sh
npm start
```

From the root of the project.

Now, after making a change to a react-native .js file, simply press Ctrl-r in the simlator (or use the developer menu on device) to apply the change.  You can always press Ctrl-r in Xcode to rebuild/redeploy the entire app, but this rarely needed.

However, if you're editing a "web" file in `web/`, you need to rebuild the *project* and relaunch the app from inside Xcode by pressing Ctrl-r.  If in doubt about which to use, the full Ctrl-r rebuild/redeploy from within Xcode always works.

### Lint

Coding style is enforced by Travis CI. You can run the linter locally with the following command:

```sh
npm run lint
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

### WiFi presets

To avoid having to re-enter WiFi credentials every time the app was restarted (not great for demos), the WiFi SSID and password can be preconfigured in `config.local.json`:

```json
{
  "wifi": {
    "ssid": "SilkLabs",
    "secret": "silkysmooth"
  }
}
```

## Producing a release by hand (Avoid at all cost)

0. Close Xcode
0. Close any react-native package servers that might be running
0. Create a fresh clone of `silk-app`
0. `cd` into your fresh clone and then `npm install`
0. Open Xcode
0. Set the build/run target to "iPhone 5s" simulator
0. Press Ctrl-r to build and launch the Silk app.  Perform quick sanity test by ensuring it connects to the silk-test-server and can show video previews and streams.
0. Switch the Xcode build/run target back to your real iOS device
0. Repeat the install and sanity check steps above
0. Select Product -> Archive to produce a clean build of the app package
0. From the app archive window that pops up, choose Export -> Save for Ad Hoc Deployment.  Use your "Weave Laboraties Inc" signing cert.
0. Put the Silk.ipa package artifact in a new directory along with the following `flash.sh` script:
  ```bash
#!/bin/bash

mkdir node_modules
npm install ios-deploy
node_modules/ios-deploy/ios-deploy -b Silk.ipa --nostart
```
0. Run `tar czf Silk-app-demo3.tgz Silk-app-demo3/` to produce a package for deployment
0. For a final QA step, unpack the `.tgz` into a test dir and run `./flash.sh` to verify successful deployment to device

To build a democonfig app package set up to run off an OS X local server over softap:

0. Create a file `config.local.json` in your app clone dir with the following contents:
  ```
{
  "server": {
    "url": "192.168.2.1:5000"
  }
}
```
0. Follow the steps above to build, QA, and package the app.
0. Take special care to verify that the server URL is set correctly and that it can connect to the demo server over softap.
