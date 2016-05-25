# Setting up

In the normal README.md we reference using `npm install` this should
still work but the preferred method is to use run
`./install.internal.sh`.

# Installing a CI build

With a provisioned device (see below) connected to the computer via USB, you can download and install the latest build of the app via the following command:
```
npm run update
```

It is also possible to specify a branch and whether you want a Debug or Release type build:
```
npm run update -- next Debug
```

# Provisioning an iDevice

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

# Producing a release by hand (Avoid at all cost)

0. Close Xcode
0. Close any react-native package servers that might be running
0. Create a fresh clone of `silk-clone` or run `npm run zest` at the top level of an existing clone (Warning! That will strip every file not managed by git, e.g. `config.local.js`, the repo cache, etc.)
0. `cd` into the `app/` directory of the clean clone and run `npm install`
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
  "serverUrl": "192.168.2.1:5000"
}
```
0. Follow the steps above to build, QA, and package the app.
0. Take special care to verify that the server URL is set correctly and that it can connect to the demo server over softap.

# Updating internal node_module folders ...

0. `rm -rf app/node_modules` (can drop app if inside this folder)
1. Remove react-native / react-native-webpack-server from package.json
2. Run `silk npm-install`
3. Create a new package.json with only react-native /
   react-native-webpack-server
4. Run `tools/npm_dedupe`
5. Run `tools/postinstall`
6. Check in app/node_modules and node_modules
