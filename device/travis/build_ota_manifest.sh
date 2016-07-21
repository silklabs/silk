#!/bin/bash -e
#
# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCAL_PATH=$(dirname $(readlink -f $0))

BRANCH=$1
BOARD=$2
PRODUCT=$3
SYSTEM_DIR=$4
OTA_DIR=$5

if [[ -z "$BRANCH" ]]; then
  echo Error: BRANCH not specified >&2
  exit 1
fi

if [[ -z "$BOARD" ]]; then
  echo Error: BOARD not specified >&2
  exit 1
fi

if [[ -z "$PRODUCT" ]]; then
  echo Error: PRODUCT not specified >&2
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

SERVER_PATH="http://update.silklabs.com/ota-internal/$BRANCH/"
BUILD_PROP=$SYSTEM_DIR/build.prop

SILK_CORE_VERSION_JSON=$(readlink -f $SYSTEM_DIR/silk/node_modules/silk-core-version/)

SILK_CORE_FINGERPRINT=$(node -p "require('$SILK_CORE_VERSION_JSON').fingerprint")
SILK_BSP_API_ID=$(node -p "require('$SILK_CORE_VERSION_JSON').bsp_api_id")
BUILD_SHA=$(node -p "require('$SILK_CORE_VERSION_JSON').sha")

ota_manifest="${OTA_DIR}/${BOARD}-${PRODUCT}.json"

echo Manifest: $ota_manifest
echo "{" > $ota_manifest
echo "  \"${BOARD}-${PRODUCT}\": {" >> $ota_manifest

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

    if [ "$fingerprint_value" != "$SILK_CORE_FINGERPRINT" ]; then
      echo Error: fingerprint mismatch between...
      echo "    1. $fingerprint_value"
      echo "    2. $SILK_CORE_FINGERPRINT"
      exit 1
    fi

    {
      echo "    \"full\": {"
      echo "      \"sha\": \"${BUILD_SHA}\","
      echo "      \"bsp_api_id\": \"${SILK_BSP_API_ID}\","
      echo "      \"fingerprint\": \"${SILK_CORE_FINGERPRINT}\","
      echo "      \"zip_url\": \"${SERVER_PATH}$(basename ${zip})\","
      echo "      \"zip_size\": \"${zip_size}\","
      echo "      \"zip_sha1\": \"${zip_sha1}\""
      echo "    }, "
     } >> $ota_manifest

  elif [[ $zip =~ .*-silkota-.* ]]; then
    echo Silk OTA: $zip

    {
      echo "    \"silk\": { "
      echo "      \"sha\": \"${BUILD_SHA}\","
      echo "      \"bsp_api_id\": \"${SILK_BSP_API_ID}\","
      echo "      \"fingerprint\": \"${SILK_CORE_FINGERPRINT}\","
      echo "      \"zip_url\": \"${SERVER_PATH}$(basename ${zip})\","
      echo "      \"zip_size\": \"${zip_size}\","
      echo "      \"zip_sha1\": \"${zip_sha1}\""
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
