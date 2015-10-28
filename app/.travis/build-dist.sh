#!/bin/bash

export NODE_DEBUG=http

mkdir build
xctool \
  -project $PROJECT.xcodeproj \
  -scheme $PROJECT \
  -sdk iphoneos \
  archive -archivePath build/$PROJECT.xcarchive \
  CODE_SIGN_IDENTITY="$DEVELOPER_NAME" \
  PROVISIONING_PROFILE="$PROFILE_UUID"

mkdir dist
xcodebuild \
  -exportArchive \
  -archivePath build/$PROJECT.xcarchive \
  -exportPath dist/$PROJECT.ipa \
  -exportFormat ipa \
  -exportProvisioningProfile "$PROFILE_NAME"
