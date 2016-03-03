#! /bin/bash -ex

# cd into the first directory ...
cd /workspace/*
ls -lah
echo $(which gcc)
export builddir=./build-$(/src/arch)/
npm install --unsafe-perm --production
