#!/bin/bash -ex

for DIR in $NPM_PACKAGE_DIRS; do
  echo -e "ENTERING $DIR"
  pushd $DIR
  npm test
  popd
  echo -e "EXITING $DIR"
done
