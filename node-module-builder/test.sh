#! /bin/bash -ex

pushd builder/tests
npm install --ignore-scripts
mkdir out
pushd

mocha $(find test -name '*_test.js' )
