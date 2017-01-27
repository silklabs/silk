#!/bin/bash -e

J="-j2"
if [[ -z $CI ]]; then
  J="-j6"
fi

if [ -z "$CAFFE_ROOT" ]; then
  cd $(dirname $0)

  # Download caffe
  SHA=24d2f67173db3344141dce24b1008efffbfe1c7d
  if [[ ! -d caffe ]]; then
    echo Downloading caffe
    git clone git@github.com:BVLC/caffe.git
    git -C caffe checkout $SHA
    pushd caffe
    git am ../patch/0001-Fix-veclib-path-for-OSX-sierra.patch
    popd
  fi

  # Check for NVIDIA GPU. If NVIDIA GPU is unavailable
  # `nvidia-smi` command returns with an empty string.
  # Given that scenario revert back to CPU mode, else
  # compile with GPU support
  if which nvidia-smi; then
    hasGPU=true
  else
    hasGPU=false
  fi

  # Install caffe
  if [[ ! -f caffe/build/lib/libcaffe.dylib && ! -f caffe/build/lib/libcaffe.so ]]; then
    echo "Compiling caffe"
    pushd caffe
    mkdir -p build
    pushd build

    # Enable CPU/GPU
    if $hasGPU; then
      cpu_mode=OFF
      cudnn_mode=ON
    else
      cpu_mode=ON
      cudnn_mode=OFF
    fi

    cmake \
      -DCPU_ONLY=$cpu_mode \
      -DUSE_CUDNN=$cudnn_mode \
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
