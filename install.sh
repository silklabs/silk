#!/bin/bash -ex

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
cd $ROOT

pwd

# TODO: This should go away once we make version loadable without a pre-install
# step.
npm build node_modules/silk-core-version
npm build node_modules/node-webrtc

if [[ "$(uname)" == "Darwin" && -z $GET_OFF_MY_LAWN ]]; then
  # Following packages are needed by caffe module
  brew install -vd snappy leveldb gflags glog szip lmdb libtool
  brew install hdf5

  brew install -vd openblas
  brew link --force --overwrite openblas

  BOOST="$(brew list -1 | grep -i "^boost\$" || true)"
  if [[ -z $BOOST ]]; then
    brew install boost
  fi

  # Following packages are needed by protobuf
  brew install autoconf
  AUTOMAKE="$(brew list -1 | grep -i "^automake\$" || true)"
  if [[ -z $AUTOMAKE ]]; then
    brew install automake
  fi
fi

# Hacks to ensure that native modules are built on your platform ...
for module_gyp in $(find -L node_modules -name 'binding.gyp') ; do
  module=$(dirname $module_gyp)
  if [[ -z $(find $module -name '*.node') ]] ; then
    JOBS=MAX npm build $module
  fi
done
