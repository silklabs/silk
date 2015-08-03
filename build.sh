#! /bin/bash -vex

./build/node/build.sh dist/node/
./build/react-native/build.sh dist/api.react-native.js
# Web build is identical to react-native build for now...
./build/browser/build.sh public/silk-api.js
