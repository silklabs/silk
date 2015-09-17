#!/bin/bash

security create-keychain -p travis ios-build.keychain
security default-keychain -s ios-build.keychain
security unlock-keychain -p travis ios-build.keychain
security set-keychain-settings -t 3600 -u ios-build.keychain
security import .travis/certs/apple.cer -k ios-build.keychain -T /usr/bin/codesign
security import .travis/certs/stooge.cer -k ios-build.keychain -T /usr/bin/codesign
security import .travis/certs/stooge.p12 -k ios-build.keychain -P $KEY_PASSWORD -T /usr/bin/codesign
security list-keychains -s ios-build.keychain

mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
cp .travis/certs/*.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles
