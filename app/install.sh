#!/bin/bash -ex

cd $(dirname $0)
# We rely on the state of the webapp dependencies so just invoke their
# install.sh
npm build node_modules/silk-core-version
