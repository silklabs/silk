#!/bin/bash -e
# Bundle React Native code and image assets. This script is supposed
# to be invoked as part of Xcode build process and relies on
# environment variables set by Xcode. The path to the JS entry file
# (relative to the repository root) needs to be provided as a
# command-line argument.

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

if [[ -z $SLK_JS_BUNDLE_ENTRY_FILE ]]; then
    echo "Must provide JS entry file path as argument"
    exit 1
fi

set -x
DEST=$CONFIGURATION_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH
DEST_FILE="$DEST/main.jsbundle"
THIS_DIR=$(cd "$(dirname "$0")"; pwd)

bundle_type="$($THIS_DIR/bundle_type)"
if [[ "$bundle_type" == "local" ]]; then
  $THIS_DIR/local_bundle "$SLK_JS_BUNDLE_ENTRY_FILE" "$DEST_FILE"
  exit 0
elif [[ "$bundle_type" != "bundle" ]]; then
  exit 0
fi

cd $THIS_DIR/../../..
node node_modules/react-native/local-cli/cli.js bundle \
  --entry-file "$SLK_JS_BUNDLE_ENTRY_FILE".js \
  --platform ios \
  --dev $DEV \
  --reset-cache \
  --bundle-output "$DEST_FILE" \
  --assets-dest "$DEST" \
  --verbose
