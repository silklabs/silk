#!/bin/bash -ex

DEST=$(mktemp -d)
node node_modules/react-native/local-cli/cli.js bundle \
  --entry-file src/index.js \
  --platform $PLATFORM \
  --dev false \
  --reset-cache true \
  --bundle-output "$DEST/index.$PLATFORM.js" \
  --assets-dest "$DEST" \
  --transformer "$PWD/src/transforms/transformer.js" \
  --verbose
