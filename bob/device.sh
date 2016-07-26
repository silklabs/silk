#!/bin/bash -ex
#
# Builds the device build defined by the BOARD/PRODUCT environment variables
#

if [[ -z $BOARD ]]; then
  echo BOARD enviroment variable unset
  exit 1
fi

if [[ -z $PRODUCT ]]; then
  echo PRODUCT enviroment variable unset
  exit 1
fi

cd device/
#
# TODO: What follows is essentially a duplicate of ../device/.travis.yml
#
source travis/before_script
echo For full build logs and other artifacts, please see $ARTIFACT_WEBHOST/$ARTIFACT_REMOTE_PATH
set +e
travis/log travis/script
exitcode=$?
set -e
travis/after_script
if [[ $exitcode -eq 0 ]]; then
  travis/after_success
fi
exit 0
