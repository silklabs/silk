#/bin/bash -x
export ANDROID_PRODUCT_OUT=$(dirname $0)
emulator -verbose -show-kernel
