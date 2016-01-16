# Prerequisites

Assuming the system is already configured from a silk device build, the
following additional packages should be installed:
OSX:
```
$ brew tap homebrew/science
$ brew install opencv
```

Linux:
```
$ sudo apt-get install libopencv-dev libudev-dev
$ sudo usermod -a -G video $(whoami)  # Ensure you have access to the camera at /dev/video0
```

# Install/Run

```
$ npm install
$ ./start
```

# Rebuilding only device-core or extensions

After installing for the first time:
```
$ pushd sim/system/silk/node_modules/silk-device/
$ npm install
$ popd
$ ./start
```

or:
```
$ pushd sim/system/silk/ext/trackobject/
$ npm install
$ popd
$ ./start
```

# Configuring the simulator

This is currently a little fragile:
```
$ cd cli
$ npm install
$ cd ../sim
$ ../cli/silk config -s sim -n MySimulator blah blah
  ^^^^^^^            ^^^^^^                ^^^^^^^^^
     \                  |                      \
      \     magic device serial for "sim"       \
       \                                   wifi ssid/psk ignored
  must be run from sim/
```
