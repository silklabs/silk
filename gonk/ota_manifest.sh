#!/bin/bash

set -e
BUILD_PROP=$1
OTA_MANIFEST=$2

if [[ -z "$BUILD_PROP" ]]; then
  echo Error: build.prop file not specified >&2
  exit 1
fi

if ! grep -q "^ro.build.fingerprint=" $BUILD_PROP; then
  echo Error: ro.build.fingerprint not found in $BUILD_PROP >&2
  exit 1
fi

if [ -z "$OTA_MANIFEST" ]; then
  echo Error: output ota manifest file not specified >&2
  exit 1
fi
if [ -e $OTA_MANIFEST ]; then
  echo Error: file already exists: $OTA_MANIFEST >&2
  exit 1
fi

sed -ne 's/^ro.build.fingerprint=\(.*\)$/{ "fingerprint" : "\1" }/p' $BUILD_PROP | tee $OTA_MANIFEST
