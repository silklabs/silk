#!/bin/bash -ex

DEST=$(mktemp -d)
node node_modules/react-native/local-cli/cli.js bundle \
  --entry-file app/src/index.js \
  --platform $PLATFORM \
  --dev false \
  --reset-cache true \
  --bundle-output "$DEST/index.$PLATFORM.js" \
  --assets-dest "$DEST" \
  --verbose
