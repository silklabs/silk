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
npm install
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


