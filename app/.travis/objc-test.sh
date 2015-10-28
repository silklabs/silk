#!/bin/bash

xctool \
  -project $PROJECT.xcodeproj \
  -scheme $PROJECT \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 5,OS=8.4' \
  test
