#!/bin/bash -ex
#
# Patch libsodium-jni, produce an .aar artifact, and publish it to the
# m2-local repository.
#

if [[ -z $ANDROID_SDK ]] ; then
  echo "You must set the ANDROID_SDK environment variable."
  exit 1
fi

if [[ -z $ANDROID_NDK ]] ; then
  echo "You must set the ANDROID_NDK environment variable."
  exit 1
fi

SWIG=$(which swig)
if [[ -z $SWIG ]] ; then
  echo "You must have 'swig' installed."
  exit 1;
fi

# Make the build system sane.
patch -p1 < libsodium-jni-build-fixes.patch

pushd libsodium-jni

# Build the binary dependencies.
pushd jni
swig -java -package org.libsodium.jni -outdir ../src/main/java/org/libsodium/jni sodium.i
popd

$ANDROID_NDK/ndk-build
rm -rf src/main/jniLibs/
cp -R libs src/main/jniLibs

# Now build and publish the aar archive in m2-local
../../../gradle/gradlew uploadArchives

popd

# Undo our build system patch so the working copy is not dirtied
# beyond the build artifacts.
patch -R -p1 < libsodium-jni-build-fixes.patch
