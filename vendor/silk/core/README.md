# silk-core


## Prerequisites

Set up the environment first by running a local install before anything else discussed below:
```
cd vendor/silk/core
npm install
```

## Javascript Rapid Development Cycle

If you are only making JavaScript changes to silk core (`silk/core/lib/`), the following may be used to reduce your build time significantly.

### Automatic push

Run `./watch`, then edit/save normally. On every save, the new `core.js` will be
automatically installed on device, and silk core restarted.

`./watch` options:
  * `LAX=1 ./watch` - to skip running ESLint
  * `./watch --no-restart` - to skip restarting silk core.

### Manual push of silk core
```sh
.. edit .js files ..
$ npm install
$ adb push core.js /system/silk/core.js
$ adb shell setprop ctl.restart silk
```

### Profiling JavaScript

NOTE: Currently there is a race somewhere with the CPU sampling code in
V8 so profiling will regularly crash the process while active (it's safe
to turn the property on but once you start the profiler all bets are
off)

First ensure profiling is enabled!

```sh
adb shell setprop persist.silk.profiling.enabled true
adb shell stop silk
adb shell start silk
```

This will ensure the profiling server is on...

Then the `./profile` CLI can be used to capture cpu samples (after `npm
install`)

```
# Start collecting data...
./profile cpu-start
# Collect data...
./profile cpu-collect
```

The collected sample will be dumped somewhere in your current working
directory as something like this: `silk_<bla>.cpuprofile`. These can be
loaded in chrome via:

1. Open Developer Tools
2. Click "Profiles"
3. Scroll down in "Select profile type" until you see "Load"
4. Click "Load" and select the generated cpu profile.

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
