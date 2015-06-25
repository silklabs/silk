#!/bin/bash

usage()
{
  [[ -n $1 ]] && echo "$@"
  cat <<EOF
usage: $0 <buildId> <archiveDir>

Archives gonk build products.

buildId    - Identifier for this build
archiveDir - Where to store the archive

EOF

  [[ -n $1 ]] && exit 1
  exit 0
}

[[ -n $1 ]] || usage


buildId="$1"
if [[ -z $buildId ]]; then
  usage "Error: buildId unspecified"
fi

archiveDir=$2
if [[ -z $archiveDir ]]; then
  usage "Error: archiveDir unspecified"
fi


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

dir_exists "$ANDROID_BUILD_TOP" "Please run envsetup.sh first"
dir_exists "$ANDROID_PRODUCT_OUT" "Please run lunch first"

if [[ -z $TARGET_PRODUCT ]]; then
  echo "Error: TARGET_PRODUCT does not exist, need some |lunch|"
  exit 1
fi

set -ex


cd $ANDROID_BUILD_TOP

archiveName=$buildId

rm -rf $archiveDir/$TARGET_PRODUCT
mkdir -p $archiveDir/$TARGET_PRODUCT

./repo manifest -r -o - > $archiveDir/$TARGET_PRODUCT/versioned.xml

cp -r $ANDROID_PRODUCT_OUT/{system/,data/} $archiveDir/$TARGET_PRODUCT

if [[ -f $ANDROID_PRODUCT_OUT/boot.img ]]; then
  # This is a full device build

  cat > $archiveDir/$TARGET_PRODUCT/flash.sh <<EOF
#/bin/sh

set -x
cd \$(dirname \$0)
adb reboot-bootloader
fastboot oem unlock
set -e
fastboot flash boot boot.img
fastboot flash system system.img
fastboot reboot

echo Note: userdata/cache partitions have been preserved.  They may
echo contain state that you want to clear, and if so run:
echo $ adb reboot-bootloader
echo $ fastboot format userdata
echo $ fastboot format cache
EOF
  cp -r $ANDROID_PRODUCT_OUT/{*.img,root/,recovery/} $archiveDir/$TARGET_PRODUCT

else
  # This is a base (partial) build

  cat > $archiveDir/$TARGET_PRODUCT/flash.sh <<EOF
#/bin/sh

set -ex
cd \$(dirname \$0)
adb wait-for-device
adb root
adb wait-for-device
adb remount
adb shell stop silk
adb shell rm -rf /system/silk /system/node_modules
adb push system /system
adb shell start silk
EOF

fi

chmod +x $archiveDir/$TARGET_PRODUCT/flash.sh

cd $archiveDir
tar zvcf $archiveName.tgz $TARGET_PRODUCT
rm -rf $TARGET_PRODUCT
cd -
ls -l $archiveDir/$archiveName.tgz
