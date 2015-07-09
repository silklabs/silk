#!/bin/bash

set -e
BUILD_PROP=$1
OTA_MANIFEST=$2

SERVER_PATH="https://silk-device.s3.amazonaws.com/master/latest/"

DIST_PATH=`dirname "${OTA_MANIFEST}"`

if [[ -z "$BUILD_PROP" ]]; then
  echo Error: build.prop file not specified >&2
  exit 1
fi

DEVICE_VALUE=`sed -ne 's/^ro.product.device=\(.*\)$/\1/p' $BUILD_PROP`
if [ -z "$DEVICE_VALUE" ]; then
  echo Error: ro.product.device not found in $BUILD_PROP >&2
  exit 1
fi

FINGERPRINT_VALUE=`sed -ne 's/^ro.build.fingerprint=\(.*\)$/\1/p' $BUILD_PROP`
if [ -z "$FINGERPRINT_VALUE" ]; then
  echo Error: ro.build.fingerprint not found in $BUILD_PROP >&2
  exit 1
fi

ZIP_FILENAME="aosp_${DEVICE_VALUE}-ota-eng.travis.zip"

ZIP_PATH="${DIST_PATH}/${ZIP_FILENAME}"
if [ ! -f "$ZIP_PATH" ]; then
  echo Error: file does not exist: $ZIP_PATH >&2
  exit 1
fi

ZIP_SIZE=`wc -c < "${ZIP_PATH}"`
ZIP_SHA1=`openssl sha1 "${ZIP_PATH}" | sed 's/^.* //'`

if [ -z "$OTA_MANIFEST" ]; then
  echo Error: output ota manifest file not specified >&2
  exit 1
fi
if [ -e "$OTA_MANIFEST" ]; then
  echo Error: file already exists: $OTA_MANIFEST >&2
  exit 1
fi

echo \
"{ \"${DEVICE_VALUE}\": { "\
"\"fingerprint\": \"${FINGERPRINT_VALUE}\", "\
"\"url\": \"${SERVER_PATH}${ZIP_FILENAME}\", "\
"\"size\": \"${ZIP_SIZE}\", "\
"\"sha1\": \"${ZIP_SHA1}\" "\
"} }" | \
tee $OTA_MANIFEST
