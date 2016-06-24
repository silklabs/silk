#!/bin/bash -e
#
# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCAL_PATH=$(dirname $(readlink -f $0))

BRANCH=$1
GONK=$2
SYSTEM_DIR=$3
OTA_DIR=$4

if [[ -z "$BRANCH" ]]; then
  echo Error: BRANCH not specified >&2
  exit 1
fi

if [[ -z "$GONK" ]]; then
  echo Error: GONK not specified >&2
  exit 1
fi

if [[ ! -d $SYSTEM_DIR ]]; then
  echo Error: SYSTEM_DIR not a directory: $SYSTEM_DIR >&2
  exit 1
fi

if [[ ! -d $OTA_DIR ]]; then
  echo Error: OTA_DIR not a directory: $OTA_DIR >&2
  exit 1
fi

SERVER_PATH="https://silk-device.s3.amazonaws.com/$BRANCH/latest/"
BUILD_PROP=$SYSTEM_DIR/build.prop

BASE_VERSION_JS=$(readlink -f $LOCAL_PATH/../propsilk/silk-gonk-version/gonk_version.js)
SILK_CORE_VERSION_JSON=$(readlink -f $SYSTEM_DIR/silk/node_modules/silk-core-version/)
BASE_VERSION=$(node -p "require('$BASE_VERSION_JS')")
CORE_VERSION=$(node -p "require('$SILK_CORE_VERSION_JSON').fingerprint")

ota_manifest="${OTA_DIR}/${GONK}_ota.json"

echo Manifest: $ota_manifest
echo "{" > $ota_manifest
echo "  \"${GONK}\": {" >> $ota_manifest

for zip in $(shopt -s nullglob; echo $OTA_DIR/*.zip); do
  zip_size=`wc -c < "${zip}"`
  zip_sha1=`openssl sha1 "${zip}" | sed 's/^.* //'`
  if [[ $zip =~ .*-ota-.* ]]; then
    echo Full OTA: $zip

    fingerprint_value=`sed -ne 's/^ro.build.fingerprint=\(.*\)$/\1/p' $BUILD_PROP`
    if [ -z "$fingerprint_value" ]; then
      echo Error: ro.build.fingerprint not found in $BUILD_PROP >&2
      exit 1
    fi

    if [ "$fingerprint_value" != "$CORE_VERSION" ]; then
      echo Error: fingerprint mismatch between...
      echo "    1. $fingerprint_value"
      echo "    2. $CORE_VERSION"
      exit 1
    fi

    {
      echo "    \"full\": {"
      echo "      \"fingerprint\": \"${fingerprint_value}\","
      echo "      \"url\": \"${SERVER_PATH}$(basename ${zip})\","
      echo "      \"size\": \"${zip_size}\","
      echo "      \"sha1\": \"${zip_sha1}\""
      echo "    }, "
     } >> $ota_manifest

  elif [[ $zip =~ .*-silkota-.* ]]; then
    echo Silk OTA: $zip

    {
      echo "    \"silk\": { "
      echo "      \"base_version\": \"${BASE_VERSION}\","
      echo "      \"core_version\": \"${CORE_VERSION}\","
      echo "      \"url\": \"${SERVER_PATH}$(basename ${zip})\","
      echo "      \"size\": \"${zip_size}\","
      echo "      \"sha1\": \"${zip_sha1}\""
      echo "    }, "
    } >> $ota_manifest

  else
    echo Error: Unknown zip type: $zip >&2
    exit 1
  fi
done
echo "    \"\": null" >> $ota_manifest
echo "  } " >> $ota_manifest
echo "} " >> $ota_manifest

exit 0
