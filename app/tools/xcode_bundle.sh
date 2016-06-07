#!/bin/bash -e

# Bundle React Native app's code and image assets.
# This script is supposed to be invoked as part of Xcode build process
# and relies on environment variables (including PWD) set by Xcode

case "$CONFIGURATION" in
  Debug)
    DEV=true
    ;;
  "")
    echo "$0 must be invoked by Xcode"
    exit 1
    ;;
  *)
    DEV=false
    ;;
esac

source $(dirname $0)/../../pub/tools/gnu.sh
APP_DIR="$(realpath $(dirname $0)/..)"
REACT_NATIVE_DIR="$APP_DIR/node_modules/react-native"

# Xcode project file for React Native apps is located in ios/ subfolder
cd ..

set -x
NODE_BINARY=node
DEST=$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH
DEST_FILE="$DEST/main.jsbundle"

bundle_type="$($APP_DIR/tools/bundle_type)"
if [[ "$bundle_type" == "local" ]]; then
  $APP_DIR/tools/local_bundle
  exit 0
elif [[ "$bundle_type" != "bundle" ]]; then
  exit 0
fi

$NODE_BINARY "$REACT_NATIVE_DIR/local-cli/cli.js" bundle \
  --entry-file src/index.js \
  --platform ios \
  --dev $DEV \
  --reset-cache true \
  --bundle-output "$DEST_FILE" \
  --assets-dest "$DEST" \
  --transformer "$APP_DIR/src/transforms/transformer.js" \
  --verbose
