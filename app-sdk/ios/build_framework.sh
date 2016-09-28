#!/bin/bash -ex

THIS_DIR=$(cd "$(dirname "$0")"; pwd)
pushd $THIS_DIR

source ../../releng/certs/ios/env.sh
../../releng/certs/ios/setup.sh

export CONFIGURATION=Release
export BUILD_DIR="$THIS_DIR/build"
export BUILD_ROOT=$BUILD_DIR
export PROJECT_NAME=SLKAppSDK
export RCT_NO_LAUNCH_PACKAGER=1

UNIVERSAL_OUTPUTFOLDER=${BUILD_DIR}/${CONFIGURATION}-universal

# Make sure the output directory exists.
mkdir -p "${UNIVERSAL_OUTPUTFOLDER}"

# Step 1. Build Device and Simulator versions
xcodebuild \
  -target "${PROJECT_NAME}" \
  -configuration ${CONFIGURATION} \
  -sdk iphoneos \
  ONLY_ACTIVE_ARCH=NO \
  BUILD_DIR="${BUILD_DIR}" \
  BUILD_ROOT="${BUILD_ROOT}" \
  clean build

xcodebuild \
  -target "${PROJECT_NAME}" \
  -configuration ${CONFIGURATION} \
  -sdk iphonesimulator \
  ONLY_ACTIVE_ARCH=NO \
  BUILD_DIR="${BUILD_DIR}" \
  BUILD_ROOT="${BUILD_ROOT}" \
  clean build

# Step 2. Copy the framework structure (from iphoneos build) to the
# universal folder
cp -R \
  "${BUILD_DIR}/${CONFIGURATION}-iphoneos/${PROJECT_NAME}.framework" \
  "${UNIVERSAL_OUTPUTFOLDER}/"

# Step 3. Copy Swift modules from iphonesimulator build (if it exists)
# to the copied framework directory
SIMULATOR_SWIFT_MODULES_DIR="${BUILD_DIR}/${CONFIGURATION}-iphonesimulator/${PROJECT_NAME}.framework/Modules/${PROJECT_NAME}.swiftmodule/."
if [ -d "${SIMULATOR_SWIFT_MODULES_DIR}" ]; then
  cp -R \
    "${SIMULATOR_SWIFT_MODULES_DIR}" \
    "${UNIVERSAL_OUTPUTFOLDER}/${PROJECT_NAME}.framework/Modules/${PROJECT_NAME}.swiftmodule"
fi

# Step 4. Create universal binary file using lipo and place the
# combined executable in the copied framework directory
lipo \
  -create \
  -output "${UNIVERSAL_OUTPUTFOLDER}/${PROJECT_NAME}.framework/${PROJECT_NAME}" \
  "${BUILD_DIR}/${CONFIGURATION}-iphonesimulator/${PROJECT_NAME}.framework/${PROJECT_NAME}" \
  "${BUILD_DIR}/${CONFIGURATION}-iphoneos/${PROJECT_NAME}.framework/${PROJECT_NAME}"

# Step 5. Clean up
../../releng/certs/ios/teardown.sh
