#!/bin/bash -ev

pushd jni
swig -java -package org.libsodium.jni -outdir ../src/main/java/org/libsodium/jni sodium.i
popd

$ANDROID_NDK/ndk-build
rm -rf src/main/jniLibs/
cp -R libs src/main/jniLibs
