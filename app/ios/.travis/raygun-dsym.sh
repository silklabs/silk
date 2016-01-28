#!/bin/bash -e
#
# Uploads iOS symbols to raygun.io
#

if [[ -z $CI ]]; then
  echo CI not defined
  exit 0
fi

if [[ "$TRAVIS_PULL_REQUEST" != "false" ]]; then
  echo "TRAVIS_PULL_REQUEST != false"
  exit 0
fi
test -f dsym.zip

set -x
EAT=$(node -p "require('silk-raygun/config.raygun.json').externalAccessToken")
APPID=$(node -p "require('silk-raygun/config.raygun.json').appId")

curl --verbose \
  --header "Host: app.raygun.io"  \
  --form "DsymFile=@dsym.zip"  \
  "https://app.raygun.io/dashboard/${APPID}/settings/symbols?authToken=${EAT}"

