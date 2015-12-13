#!/bin/bash -x

export NODE_DEBUG=http

mkdir -p build
xctool \
  -project $PROJECT.xcodeproj \
  -scheme $PROJECT \
  -sdk iphoneos \
  EXFILTRATED_DSYM_ZIP=$(pwd)/dsym.zip \
  archive -archivePath build/$PROJECT.xcarchive \
  CODE_SIGN_IDENTITY="$DEVELOPER_NAME" \
  PROVISIONING_PROFILE="$PROFILE_UUID"

ls -l dsym.zip

mkdir -p dist
xcodebuild \
  -exportArchive \
  -archivePath build/$PROJECT.xcarchive \
  -exportPath dist/$PROJECT.ipa \
  -exportFormat ipa \
  -exportProvisioningProfile "$PROFILE_NAME"
