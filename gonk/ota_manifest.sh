#!/bin/bash -e
#
# Copyright (c) 2015 Silk Labs, Inc.
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

BASE_VERSION_JS=$(readlink -f $LOCAL_PATH/../vendor/silk/core/lib/base_version.js)
CORE_VERSION_JS=$(readlink -f $SYSTEM_DIR/silk/node_modules/core_version.js)

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

    # TODO: Remove the next |echo| statement after November 1st.  This data is
    #       expected by older devices, and will enable them to update seamlessly
    #       to the newer format.
    echo "    \"fingerprint\": \"${fingerprint_value}\", "\
         "\"url\": \"${SERVER_PATH}$(basename ${zip})\", "\
         "\"size\": \"${zip_size}\", "\
         "\"sha1\": \"${zip_sha1}\", "\
      >> $ota_manifest

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

    base_version=$(node -e "console.log(require('$BASE_VERSION_JS'))")
    core_version=$(node -e "console.log(require('$CORE_VERSION_JS'))")

    {
      echo "    \"silk\": { "
      echo "      \"base_version\": \"${base_version}\","
      echo "      \"core_version\": \"${core_version}\","
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
