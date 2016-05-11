# Prerequisites

Assuming the system is already configured from a silk device build, the
following additional packages should be installed:

OSX:
```
$ brew update
$ brew install pkg-config
$ brew install sox
$ brew tap homebrew/science
$ brew install opencv3 --with-contrib
$ cp /usr/local/Cellar/opencv3/3.1.0_1/share/OpenCV/3rdparty/lib/libippicv.a /usr/local/Cellar/opencv3/3.1.0_1/lib/
$ brew link --force --overwrite opencv3
$ pkg-config --modversion opencv
```

Linux:
For Linux it's necessary to compile OpenCV3 from source
```
$ git clone --branch '3.1.0' git@github.com:Itseez/opencv.git
$ cd opencv
$ mkdir build && cd build
$ cmake -Wno-dev \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DBUILD_TESTS=false \
  -DWITH_TIFF=false \
  -DWITH_CUDA=false \
  -DBUILD_ANDROID_EXAMPLES=false \
  -DWITH_OPENEXR=false \
  -DBUILD_PERF_TESTS=false \
  -DBUILD_opencv_java=false \
  -DWITH_IPP=OFF \
  -DCMAKE_INSTALL_PREFIX=/usr/ \
  ..
$ make -j4
$ sudo make install
```

Also, 
```
$ sudo usermod -a -G video $(whoami)  # Ensure you have access to the camera at /dev/video0
```

# Configuring

Ensure you have the `silk` cli set up:
```
$ source setup
$ pushd cli-plugin-internal; npm install; popd
```

And that the cli is authenticated:
```
$ silk login -u http://localhost:5000/ e@silk.io raccoon
```

Then call the `silk configure` command from the `sim/` directory:
```
$ cd sim
$ silk configure -s sim -n MySimulator blah blah
  ^^^^             ^^^^^               ^^^^^^^^^
     \               |                      \
      \   magic device serial for "sim"      \
       \                             wifi ssid/psk ignored
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
