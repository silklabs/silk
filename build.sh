#! /bin/bash -vex

./build/node/build.sh dist/node/
./build/react-native/build.sh dist/react-native/
./build/browser/build.sh public/silk-api.js
