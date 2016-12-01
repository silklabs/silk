#!/bin/bash -e

J="-j2"
if [[ -z $CI ]]; then
  J="-j6"
fi

if [ -z "$CAFFE_ROOT" ]; then
  # Download caffe
  SHA=24d2f67173db3344141dce24b1008efffbfe1c7d
  if [[ ! -d caffe ]]; then
    echo Downloading caffe
    git clone --depth 1 git@github.com:BVLC/caffe.git
    git -C caffe checkout $SHA
    pushd caffe
    git am ../patch/0001-Fix-veclib-path-for-OSX-sierra.patch
    popd
  fi

  # Install caffe
  if [[ ! -f caffe/build/lib/libcaffe.dylib && ! -f caffe/build/lib/libcaffe.so ]]; then
    echo "Compiling caffe"
    pushd caffe
    mkdir -p build
    pushd build
    cmake \
      -DCPU_ONLY=ON \
      -DBUILD_python=OFF \
      -DBUILD_matlab=OFF \
      -DUSE_LEVELDB=OFF \
      -DUSE_LMDB=OFF \
      -DBUILD_docs=OFF \
      ..
    make all $J
    popd
    popd
  else
    echo "Caffe already compiled; skipping compilation"
  fi
else
  echo "Using caffe from $CAFFE_ROOT"
fi
