# Silk App [![Build Status](https://www.bitrise.io/app/d9e00c0d5873d177.svg?token=xZR_r_tSrDeJ5E2jGkjlkg&branch=master)](https://www.bitrise.io/app/d9e00c0d5873d177)

Silk app written for react-native.  To install the react-native toolchain, [see these instructions](http://facebook.github.io/react-native/docs/getting-started.html#content).


## Setting up a development environment

**BEFORE OPENING THE PROJECT IN XCODE**, install the module dependencies in your clone dir
```
npm install
```

To run the app, open Silk.xcodeproj in Xcode.  You'll want to do most development in the iOS simulator(s).  Choose a simulator target at the top-left of the xcode UI.  Currently, silk app targets iPhone 5s.  Press Ctrl-r to build and run the application in the simulator.

## Provisioning an iDevice

You can do most Silk development using the (excellent!) iOS simulators.  However, for Bluetooth development, performance testing, and touch-tap testing, a physical device is required.  Currently the Silk App is optimized for the iPhone 5s / iPod Touch 5th gen screen resolution.  iPod Touch 5 devices are good for development because they're relatively cheap.  To provision a new device:

0. Connect the device to iTunes and ensure it's updated to latest iOS.
0. Sign in to https://developer.apple.com with an Apple ID that's a member of the Silk Labs development team.
0. Navigate to "Certificates, Identifiers & Profiles" -> iOS section -> Devices.
0. Click "+" icon at top-right to add a new device.
0. Open iTunes and find the "Serial Number" list for your device.  Click this once to switch the disply to "UDID".  Right-click the UDID and copy it.
0. Paste the UDID you copied into the developer.apple.com add-device UI.  Give your device a memorable name and click "Continue", then "Register".
0. Open Xcode.  Ensure your Apple ID account has been set up in Xcode.
0. In the top-left of Xcode UI, choose your iDevice in the drop-down menu to set it as the build/run target.
0. Press Ctrl-r to run Silk App on your iDevice.  In the 'Failed to code sign "Silk"' dialog box that pops up, press the "Fix Issue" button.

Xcode should then set up your device and launch the Silk App on your device.  You're done!

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
    "url": "http://localhost:8081/index.ios.bundle"
  },

  // You may also pass a config to override the default
silk-server instance.
  "server": {
    "url": "http://localhost:5000"
  }
}
```

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
