#!/bin/bash
#
# Archives a shamu device build
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
dir_exists "$ANDROID_BUILD_TOP/out/target/product/shamu" "Make build products not found"

stamp=$(date +%F_%H%M%S)

set -ex

cd $ANDROID_BUILD_TOP
mkdir $ARCHIVEDIR/shamu-${stamp}

./repo manifest -r -o $ARCHIVEDIR/shamu-${stamp}/versioned.xml

cat > $ARCHIVEDIR/shamu-${stamp}/flash.sh <<EOF
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
chmod +x $ARCHIVEDIR/shamu-${stamp}/flash.sh

cp -r out/target/product/shamu/{android-info.txt,*.img,installed-files.txt,system/,root/,data/,recovery/} $ARCHIVEDIR/shamu-${stamp}

cd $ARCHIVEDIR
tar zvcf shamu-${stamp}.tgz shamu-${stamp}
rm -rf shamu-${stamp}
cd -
ls -l $ARCHIVEDIR/shamu-${stamp}.tgz
