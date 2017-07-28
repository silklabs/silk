#!/bin/bash -e

J="-j2"
if [[ -z $CI ]]; then
  J="-j6"
fi

# Install and build OpenCV from source
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
    -DWITH_IPP=ON \
    -DCMAKE_INSTALL_PREFIX=/usr/ \
    ..
  make -j4
  popd
}

function install_package_osx {
  local problem=$(brew ls --versions $1 | grep $1 || true)
  echo Checking for $1: $problem
  if [ "" == "$problem" ]; then
    echo "Not $1 found; setting it up"
    set -x
    brew install -vd $1
  fi
}

function install_package_linux {
  local problem=$(dpkg -s $1 | grep installed || true)
  echo Checking for $1: $problem
  if [ "" == "$problem" ]; then
    echo "Not $1 found; setting it up"
    set -x
    sudo apt-get --force-yes --yes install $1
  fi
}

function install_dependencies {
  if [[ "$(uname)" == "Darwin" ]]; then
    (
      install_package_osx snappy
      install_package_osx gflags
      install_package_osx szip
      install_package_osx libtool
      install_package_osx protobuf
      install_package_osx glog
      install_package_osx hdf5
      install_package_osx openblas
      brew link --force --overwrite openblas
      install_package_osx boost
      install_package_osx webp # OpenCV3 wants libwebp
    )

    # Install OpenCV
    install_package_osx opencv3
    cp /usr/local/Cellar/opencv3/3.1.0_*/share/OpenCV/3rdparty/lib/libippicv.a /usr/local/Cellar/opencv3/3.1.0_*/lib/
    brew link --force --overwrite opencv3

  elif [[ "$(uname)" == "Linux" ]]; then
    install_package_linux libsnappy-dev
    install_package_linux libatlas-base-dev
    install_package_linux libboost-all-dev
    install_package_linux libgflags-dev
    install_package_linux libprotobuf-dev
    install_package_linux protobuf-compiler
    install_package_linux libgoogle-glog-dev
    install_package_linux libhdf5-serial-dev

    # Install OpenCV from source as opencv PPA on Linux doesn't seem to have
    # IPP libraries that caffe needs
    if [[ ! -d "opencv" ]]; then
      echo "Building OpenCV"
      install_opencv
    fi
  fi
}

# Install and build Caffe
if [ -z "$CAFFE_ROOT" ]; then
  pushd $(dirname $0)

  echo "Installing dependencies"
  install_dependencies

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
      -DOpenCV_DIR=$(pwd)/../../opencv/build \
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

JOBS=max npm run rebuild
