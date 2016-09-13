#!/bin/bash -x

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
cd $ROOT

pwd

npm build node_modules/silk-external-dlib
npm build node_modules/silk-dnn-models

if [[ "$(uname)" == "Darwin" && -z $GET_OFF_MY_LAWN ]]; then
  # Following packages are needed by caffe module
  brew install -vd snappy gflags szip libtool protobuf glog
  
  # OpenCV3 wants libwebp
  brew install webp

  brew install -vd openblas
  brew link --force --overwrite openblas

  BOOST="$(brew list -1 | grep -i "^boost\$" || true)"
  if [[ -z $BOOST ]]; then
    brew install boost
  fi
fi

function package_exists {
  set +e #dpkg returns exit code of 0 when a package is not installed
  problem=$(dpkg -s $1|grep installed)
  set -e
  echo Checking for $1: $problem
  if [ "" == "$problem" ]; then
     echo "No $1 found; setting it up"
     sudo apt-get --force-yes --yes install $1
  fi
}

if [[ "$(uname)" == "Linux" && -z $GET_OFF_MY_LAWN ]]; then
  # Following packages are needed by caffe module
  package_exists libsnappy-dev
  package_exists libatlas-base-dev
  package_exists libboost-all-dev
  package_exists libgflags-dev
  package_exists libprotobuf-dev
  package_exists protobuf-compiler
  package_exists libgoogle-glog-dev
fi

# Hacks to ensure that native modules are built on your platform ...
for module_gyp in $(find -L node_modules -name 'binding.gyp' ) ; do
  module=$(dirname $module_gyp)

  if [[ $module == 'node_modules/node-webrtc' ]]; then
    echo "Skipping node-webrtc (uses prebuilts)"
    continue
  fi

  if [[ "$FORCE" == 1 || -z "$(find $module -name '*.node')" ]] ; then
    JOBS=MAX npm build $module
  fi
done
