#!/bin/bash

if [[ -z $PROFILE_FILE_NAME ]]; then
  echo PROFILE_FILE_NAME not defined
  exit 1
fi

security create-keychain -p travis ios-build.keychain
security default-keychain -s ios-build.keychain
security unlock-keychain -p travis ios-build.keychain
security set-keychain-settings -t 3600 -u ios-build.keychain
security import ios/.travis/certs/apple.cer -k ios-build.keychain -T /usr/bin/codesign
security import ios/.travis/certs/stooge.cer -k ios-build.keychain -T /usr/bin/codesign
security import ios/.travis/certs/stooge.p12 -k ios-build.keychain -P knucklehead -T /usr/bin/codesign
security list-keychains -s ios-build.keychain

mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
cp ios/.travis/certs/$PROFILE_FILE_NAME ~/Library/MobileDevice/Provisioning\ Profiles
