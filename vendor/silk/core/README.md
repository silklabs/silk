# silk-core


## Prerequisites

Set up the environment first by running a local install before anything else discussed below:
```
cd vendor/silk/core
npm install
```

## Javascript Rapid Development Cycle

If you are only making JavaScript changes to silk core (`silk/core/lib/`), or to the
extensions (`silk/ext/*/lib`) , the following may be used to reduce your build time significantly.

### Automatic push

Run `./watch`, then edit/save normally. On every save, the new `core.js` will be
automatically installed on device, and silk core restarted.

`./watch` options:
  * `LAX=1 ./watch` - to skip running ESLint
  * `./watch --no-restart` - to skip restarting silk core.
  * `./watch --reload-ext` - to tell silk core to reload the extension instead of restarting silk core (see [Extensions Reloading](#extensions-reloading))

### Manual push of silk core
```sh
.. edit .js files ..
$ npm install
$ adb push core.js /system/silk/core.js
$ adb shell setprop ctl.restart silk
```

### Manual push and reload of extensions

```sh
.. edit .js files ..
$ npm install
$ adb push <extension-name>.js /system/silk/ext/<extension-name>.js
$ adb shell setprop silk.reload-ext "/system/silk/ext/<extension-name>.js"
```

### Extensions Reloading

Note: extension module reloading only works if the extension has implemented `willUnload()`

## JavaScript Debugging

The node debugger is activate by default in non-production builds.  To set
breakpoints, either first restart the main silk program and tell node to halt at
the first line:
```
$ adb shell stop silk
$ adb shell silk --debug-brk
```
or use the `debugger` Javascript function to manually set a breakpoint anywhere
you'd like.

The [built-in node debugger](https://nodejs.org/api/debugger.html#debugger_info)
may be invoked by running the following commands on the host machine:
```
$ adb forward tcp:5858 tcp:5858
$ node debug localhost:5858
```

More sophisticated debugging is available with [node-inspector](https://github.com/node-inspector/node-inspector/blob/v0.11.1/README.md).
Run ```./debug``` to (install, patch, and) launch node-inspector.

They are currently a couple of caveats to using node-inspector:
* It's a little bit unstable in general because we are using it in a way that
is not officially supported by the upstream project -- specifically the
node-inspector server runs on the host instead of on device alongside the node
debugee process.
* Upon entering the node-inspector web UI, wait until the `"Error: Cannot find module '../../lib/InjectionServer.js'"`
message is display before starting debugging, as before that time it's still
initializing.  Note that the error itself is currently nonfatal, node-inspector
is attempting to inject additional debug hooks into the device debugee and
failed because it assumes the debugger and debugee share the same filesystem.
* Execution sometimes needs to be paused before set breakpoints will be
activated for the first time.
