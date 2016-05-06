#! /bin/bash -x

# Emulator archive script. This will handle creating a folder which contains all
# the various pieces needed to run the emulator. This script can only be run
# after a full successful build has completed for QEMU.

dest=$1
mkdir -p $dest/bin $dest/lib $dest/system $dest/prebuilts/qemu-kernel/arm/

# adb ...
cp $ANDROID_HOST_OUT/bin/adb $dest/bin

# emulator specific helpers ...
cp $ANDROID_EMULATOR_PREBUILTS/emulator* $dest/bin
cp $ANDROID_EMULATOR_PREBUILTS/lib/* $dest/lib

# emulator kernel
# TODO: Support other emulator kernels ? (x86, arm64, etc... ?)
cp \
  $ANDROID_BUILD_TOP/prebuilts/qemu-kernel/arm/kernel-qemu-armv7 \
  $dest/prebuilts/qemu-kernel/arm/

cp $ANDROID_PRODUCT_OUT/*.img $dest/

cp $ANDROID_PRODUCT_OUT/system/build.prop $dest/system

# Add some preamble which sets some common android build system environment
# variables. These variables are used by the emulator command to find where
# various libraries are which allows us to share run-emulator script.
cat > $dest/bin/run-emulator <<'EOF'
#! /bin/bash
# Resolve to realpath....
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
SOURCE="$(readlink "$SOURCE")"
[[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )/.." && pwd )"

export ANDROID_PRODUCT_OUT=$ROOT
export ANDROID_BUILD_TOP=$ROOT
PATH=$ROOT/bin:$PATH
EOF

tail -n +2 $ANDROID_BUILD_TOP/run-emulator >> $dest/bin/run-emulator
chmod u+x $dest/bin/run-emulator

