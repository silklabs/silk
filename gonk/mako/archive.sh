#!/bin/bash
#
# Archives a mako device build
#

ARCHIVEDIR=$1

dir_exists()
{
  if [[ -z $1 ]]; then
    echo Error: $2
    exit 1
  fi

  if [[ ! -d $1 ]]; then
    echo Error: $1 directory invalid: $2
    exit 1
  fi
}

dir_exists "$ARCHIVEDIR" "Archive directory not specified"
dir_exists "$ANDROID_BUILD_TOP" "Please run envsetup.sh first"
dir_exists "$ANDROID_BUILD_TOP/out/target/product/mako" "Make build products not found"

stamp=$(date +%F_%H%M%S)

set -ex

cd $ANDROID_BUILD_TOP
mkdir $ARCHIVEDIR/mako-${stamp}

./repo manifest -r -o $ARCHIVEDIR/mako-${stamp}/versioned.xml

cat > $ARCHIVEDIR/mako-${stamp}/flash.sh <<EOF
#/bin/sh

set -x
adb reboot-bootloader
fastboot oem unlock
fastboot flash boot boot.img
fastboot flash system system.img
fastboot flash userdata userdata.img
fastboot format cache
fastboot reboot
EOF
chmod +x $ARCHIVEDIR/mako-${stamp}/flash.sh

cp -r out/target/product/mako/{android-info.txt,*.img,installed-files.txt,system/,root/,data/,recovery/} $ARCHIVEDIR/mako-${stamp}

cd $ARCHIVEDIR
tar zvcf mako-${stamp}.tgz mako-${stamp}
rm -rf mako-${stamp}
cd -
ls -l $ARCHIVEDIR/mako-${stamp}.tgz
