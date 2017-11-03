#!/bin/bash -ex

USE_NDK=false
if [[ "$1" = "--ndk" ]]; then
  USE_NDK=true
  if [[ ! -d $ANDROID_NDK ]]; then
    echo Error: ANDROID_NDK not a directory: $ANDROID_NDK
    exit 1
  fi
fi

if [[ ! -d NNPACK ]]; then
  rm -rf NNPACK
  git clone --recursive git@github.com:silklabs/NNPACK.git
fi
cd NNPACK/

if [[ ! -d env ]]; then
  virtualenv env
fi
source env/bin/activate
pip install ninja-syntax

if [[ ! -d PeachPy ]]; then
  git clone https://github.com/Maratyszcza/PeachPy.git
fi
if ! pip list --format=legacy | grep -q PeachPy; then
  (
    cd PeachPy
    pip install --upgrade -r requirements.txt
    python setup.py generate
    pip install --upgrade .
  )
fi

if $USE_NDK; then
  # Select right platform and ABI
  if [[ "$SILK_BUILDJS_ARCH" = "arm64" ]]; then
    APP_ABI=arm64-v8a
  else
    APP_ABI=armeabi-v7a
  fi
  cat > jni/Application.mk <<EOF
APP_PLATFORM := android-21
APP_PIE := true
APP_ABI := $APP_ABI
APP_STL := c++_static
NDK_TOOLCHAIN_VERSION := clang
EOF

  $ANDROID_NDK/ndk-build -j$(nproc)
else
  python ./configure.py --enable-shared
  ninja
fi

exit 0
