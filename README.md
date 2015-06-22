# Silk App

Silk app written for react-native.  To install the react-native toolchain, [see these instructions](http://facebook.github.io/react-native/docs/getting-started.html#content).

**BEFORE OPENING THE PROJECT IN XCODE**, install the module dependencies in your clone dir
```
npm install
```

To run the app, open Silk.xcodeproj in Xcode.  You'll want to do most development in the iOS simulator(s).  Choose a simulator target at the top-left of the xcode UI.  Currently, silk app targets iPhone 5s.  Press Ctrl-r to build and run the application in the simulator.

react-native supports shift-reload development.  After making a change to a react-native .js file, simply press Ctrl-r in the simlator (or use the developer menu on device) to apply the change.  You can always press Ctrl-r in Xcode to reload the entire app, but this rarely needed.

To run react-native on device, [see these instructions](http://facebook.github.io/react-native/docs/runningondevice.html).

## Editing code

When editing the react-native component .js files, for example MonitorPreview.js, you can simply press Ctrl-r in the simulator to "reload" the app.  However, if you're editing a "web" file in `web/`, you need to rebuild the *project* and relaunch the app from inside Xcode by pressing Ctrl-r.  If in doubt about which to use, the latter always works.
