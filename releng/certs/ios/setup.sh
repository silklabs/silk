#!/bin/bash -ex
#
# Set up the XCode provisioning profile and keys for CI.
# Only meant for CI environments.
#

THIS_DIR=$(cd "$(dirname "$0")"; pwd)

if [[ -z $PROFILE_FILE_NAME ]]; then
  echo "PROFILE_FILE_NAME not defined, source $THIS_DIR/env.sh first"
  exit 1
fi

security create-keychain -p travis ios-build.keychain
security default-keychain -s ios-build.keychain
security unlock-keychain -p travis ios-build.keychain
security set-keychain-settings -t 3600 -u ios-build.keychain
security import $THIS_DIR/apple.cer -k ios-build.keychain -T /usr/bin/codesign
security import $THIS_DIR/stooge.cer -k ios-build.keychain -T /usr/bin/codesign
security import $THIS_DIR/stooge.p12 -k ios-build.keychain -P knucklehead -T /usr/bin/codesign

security list-keychains
security find-identity -p codesigning ios-build.keychain

mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
cp $THIS_DIR/$PROFILE_FILE_NAME ~/Library/MobileDevice/Provisioning\ Profiles
