# Prerequisites

Assuming the system is already configured from a silk device build, the
following additional packages should be installed:

OSX:
```
$ brew tap homebrew/science
$ brew install opencv
$ brew install pkg-config
```

Linux:
```
$ sudo apt-get install libopencv-dev libudev-dev
$ sudo usermod -a -G video $(whoami)  # Ensure you have access to the camera at /dev/video0
```

# Configuring

Ensure you have the `silk` cli set up:
```
$ cd cli-plugin-internal && npm install && cd ..
$ source setup
```

And that the cli is authenticated:
```
$ ./cli/silk login -u http://localhost:5000/ e@silk.io raccoon`
```

Then call the `silk configure` command from the `sim/` directory:
```
$ cd sim
$ ../cli/silk configure -s sim -n MySimulator blah blah
  ^^^^^^^               ^^^^^^                ^^^^^^^^^
     \                     |                      \
      \       magic device serial for "sim"        \
       \                                  wifi ssid/psk ignored
  must be run from sim/
```

# Install/Run

You're now ready to install and run the simulator:

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
