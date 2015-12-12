#!/bin/bash
#
# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

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

  # Create flash script
  cat > $archiveDir/$TARGET_PRODUCT/flash.sh <<'EOF'
#/bin/sh

set -x
cd $(dirname $0)
adb reboot-bootloader
fastboot oem unlock
set -e
fastboot flash boot boot.img
fastboot flash recovery recovery.img
fastboot flash system system.img

if [ "$1" = "-w" ]; then
  echo wipe user data/cache partitions
  fastboot format userdata
  fastboot format cache
else
  echo
  echo Note: userdata/cache partitions have been preserved. They may
  echo contain state that you want to clear, and if so run:
  echo $ adb reboot-bootloader
  echo $ fastboot format userdata
  echo $ fastboot format cache
fi

fastboot reboot
set +x
EOF
  chmod +x $archiveDir/$TARGET_PRODUCT/flash.sh

  # Copy branch file
  cp ../../version/branch $archiveDir/$TARGET_PRODUCT

  # Create flash_fut script
  cat > $archiveDir/$TARGET_PRODUCT/flash_fut.sh <<'EOF'
#!/bin/bash

waitForDevice() {
  adb wait-for-device
  # adb sometimes errors out, if so, wait and try again
  while [ $? -ne 0 ]; do
    sleep 1
    adb wait-for-device
  done
}

cd $(dirname $0)

echo Flash the build and clear userdata/cache partitions
./flash.sh -w

echo Preparing default.prop ...
if [ -f default.prop ]; then
rm default.prop
fi

echo OTA updates enabled.
echo persist.silk.update.enabled=true >> default.prop

echo Enable crash reporting
echo persist.silk.crashrprt.enabled=true >> default.prop

echo Activated uploads to cloud storage
echo persist.silk.vidupload.enabled=1 >> default.prop

echo Set ota manifest channel
source ../branch
echo persist.silk.update.channel=$BRANCH >> default.prop

echo Disable SOS vibrate
echo persist.silk.quiet=true >> default.prop

echo Configuring the device ...
waitForDevice
adb root
waitForDevice

echo Pushing new default.prop ...
adb remount
waitForDevice
adb push default.prop /system/
rm default.prop

echo Set device time to match host: $(date)
adb shell time_genoff $(date +%s)000

echo Rebooting...
adb reboot
waitForDevice
echo Device provisioning successful

EOF

  chmod +x $archiveDir/$TARGET_PRODUCT/flash_fut.sh

  # Create flash_demo script
  cat > $archiveDir/$TARGET_PRODUCT/flash_demo.sh <<'EOF'
#!/bin/bash
# "Official" demo config

cd $(dirname $0)

echo Flash the build and clear userdata/cache partitions
./flash.sh -w

adb wait-for-device

echo Preparing default.prop ...
rm default.prop

adb root
adb wait-for-device

echo Activated uploads to cloud storage
echo persist.silk.vidupload.enabled=1 >> default.prop

echo Enable sounds on double clap ze clapper
echo persist.silk.clapper.sound=true >> default.prop

echo Set device time to match host: $(date)
adb shell time_genoff $(date +%s)000

echo Disable vibration
echo persist.silk.quiet=true >> default.prop

echo Disable BLE ranger to avoid wifi 2.4GHz conflicts
echo persist.silk.ranger.enabled=false >> default.prop

echo Pushing new default.prop ...
adb remount
adb push default.prop /system/
rm default.prop

echo Rebooting to apply configuration...
adb reboot
adb wait-for-device
echo Device provisioning successful
EOF

  chmod +x $archiveDir/$TARGET_PRODUCT/flash_demo.sh

  cp -r $ANDROID_PRODUCT_OUT/{*.img,root/,recovery/} $archiveDir/$TARGET_PRODUCT

elif [[ -f $ANDROID_PRODUCT_OUT/ramdisk.img ]]; then
  # This is a qemu full device build

  cp -r $ANDROID_PRODUCT_OUT/{*.img,root/} $archiveDir/$TARGET_PRODUCT

  cat > $archiveDir/$TARGET_PRODUCT/run.sh <<'EOF'
#/bin/sh

set -x
export ANDROID_PRODUCT_OUT=$(dirname $0)
emulator -verbose -show-kernel
EOF
  chmod +x $archiveDir/$TARGET_PRODUCT/run.sh

else
  # This is a base (partial) build

  cat > $archiveDir/$TARGET_PRODUCT/flash.sh <<EOF
#/bin/sh

waitForDevice() {
  adb wait-for-device
  # adb sometimes errors out, if so, wait and try again
  while [ $? -ne 0 ]; do
    sleep 1
    adb wait-for-device
  done
}

set -ex
cd \$(dirname \$0)
waitForDevice
adb root
waitForDevice
adb remount
adb shell stop
adb shell rm -rf /system/silk
adb push system /system
adb shell start
EOF

  chmod +x $archiveDir/$TARGET_PRODUCT/flash.sh

fi


cd $archiveDir
tar zvcf $archiveName.tgz $TARGET_PRODUCT
rm -rf $TARGET_PRODUCT
cd -
ls -l $archiveDir/$archiveName.tgz
