#!/bin/bash -e

J="-j2"
if [[ -z $CI ]]; then
  J="-j6"
fi

# Insatall and build OpenCV-3.1.0
function install_opencv {
  git clone --branch '3.1.0' git@github.com:Itseez/opencv.git
  pushd opencv
  mkdir build && cd build
  cmake -Wno-dev \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    -DBUILD_TESTS=false \
    -DWITH_TIFF=false \
    -DWITH_CUDA=false \
    -DBUILD_ANDROID_EXAMPLES=false \
    -DWITH_OPENEXR=false \
    -DBUILD_PERF_TESTS=false \
    -DBUILD_opencv_java=false \
    -DWITH_IPP=OFF \
    -DCMAKE_INSTALL_PREFIX=/usr/ \
    ..
  make -j4
  sudo make install
  popd
}

# Install and build Caffe
if [ -z "$CAFFE_ROOT" ]; then
  pushd $(dirname $0)

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

  # Install OpenCV
  if [[ ! -d "opencv" ]]; then
    echo "Building OpenCV-3.1.0"
    install_opencv
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
      -DOpenCV_DIR=opencv \
      ..

    make all $J
    popd
    popd
    popd
  else
    echo "Caffe already compiled; skipping compilation"
  fi
else
  echo "Using caffe from $CAFFE_ROOT"
fi
