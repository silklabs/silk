#!/bin/bash
#
# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

usage()
{
  [[ -n $1 ]] && echo "$@"
  cat <<EOF
usage: $0 <buildId> <archiveDir>

Builds a device build archive

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
dir_exists "board/$SILK_BOARD" "Please run lunch first"

set -ex

cd $ANDROID_BUILD_TOP

rm -rf $archiveDir/$buildId
mkdir -p $archiveDir/$buildId

./repo manifest -r -o - > $archiveDir/$buildId/versioned.xml

if [[ -f $ANDROID_PRODUCT_OUT/boot.img ]]; then
  # This is a full device build

  # Create flash script
  cat > $archiveDir/$buildId/flash.sh <<'EOF'
#/bin/sh

set -x
cd $(dirname $0)
adb reboot-bootloader
fastboot oem unlock

FULL=false
WIPE=false
if [ "$1" = "-f" ]; then
  shift
  WIPE=true
  if [ -d nhlos ]; then
    FULL=true
  else
    echo "No nhlos/ found"
  fi
fi
if [ "$1" = "-w" ]; then
  WIPE=true
fi


set -e
if $FULL; then
  cd nhlos
  # TODO: This is specific to 8909, will need to generalize eventually...
  function flash_nhlos() {
    fastboot flash partition gpt_both0.bin
    fastboot flash modem NON-HLOS.bin
    fastboot flash sbl1 sbl1.mbn
    fastboot flash rpm rpm.mbn
    fastboot flash tz tz.mbn
    fastboot flash sec sec.dat
    fastboot flash persist persist.img
    fastboot flash aboot emmc_appsboot.mbn
  }
  flash_nhlos # Update partition table through LK
  fastboot reboot-bootloader
  sleep 1 # OSX needs some sleep here
  flash_nhlos # Update everything again using the new LK
  cd ..
fi

fastboot oem set_active:_a || true
fastboot flash boot boot.img
fastboot flash system system.img
if [ -r recovery.img ]; then
  fastboot flash recovery recovery.img
fi
if [ -r splash.img ]; then
  fastboot flash splash splash.img
fi

if $WIPE; then
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

waitForDevice() {
  adb wait-for-device
  # adb sometimes errors out, if so, wait and try again
  while [ $? -ne 0 ]; do
    sleep 1
    adb wait-for-device
  done
}

echo Waiting for device to boot
waitForDevice
adb root
waitForDevice

echo Set device time to match host: $(date)
adb shell time_genoff $(date +%s)000

set +x
EOF
  chmod +x $archiveDir/$buildId/flash.sh

  # Create flash_noserver script
  cat > $archiveDir/$buildId/flash_noserver.sh <<'EOF'
#!/bin/bash -e
# Hub device config

echo Flash the build and clear userdata/cache partitions
$(dirname $0)/flash.sh $@ -w

waitForDevice() {
  adb wait-for-device
  # adb sometimes errors out, if so, wait and try again
  while [ $? -ne 0 ]; do
    sleep 1
    adb wait-for-device
  done
}

echo Disabling verity
adb disable-verity
adb reboot
waitForDevice
adb root 
waitForDevice

echo Preparing build.prop...
rm -f build.prop
adb pull /system/build.prop

echo persist.silk.dev.no_server=true >> build.prop
echo persist.silk.update.enabled=false >> build.prop

echo Pushing new build.prop ...
adb remount
adb push build.prop /system/
rm -f build.prop

echo Rebooting to apply configuration...
adb reboot
waitForDevice
echo Device provisioning successful
exit 0
EOF

  chmod +x $archiveDir/$buildId/flash_noserver.sh

  cp -r $ANDROID_PRODUCT_OUT/*.img $archiveDir/$buildId

  if [[ -d board/$SILK_BOARD/nhlos ]]; then
    cp -r board/$SILK_BOARD/nhlos $archiveDir/$buildId
  fi

elif [[ -f $ANDROID_PRODUCT_OUT/ramdisk.img ]]; then
  # This is a qemu full device build

  cp -r $ANDROID_PRODUCT_OUT/*.img $archiveDir/$buildId
  mkdir -p $archiveDir/$buildId/system
  cp -r $ANDROID_PRODUCT_OUT/system/build.prop $archiveDir/$buildId/system

  cat > $archiveDir/$buildId/run.sh <<'EOF'
#/bin/sh

set -x
export ANDROID_PRODUCT_OUT=$(dirname $0)
emulator -verbose -show-kernel
EOF
  chmod +x $archiveDir/$buildId/run.sh

else
  # This is a base (partial) build
  cp -r $ANDROID_PRODUCT_OUT/{system/,data/} $archiveDir/$buildId

  cat > $archiveDir/$buildId/flash.sh <<EOF
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
if [ "\$1" = "-w" ]; then
  adb shell librecovery_test factoryReset
else
  adb shell start
fi
EOF

  chmod +x $archiveDir/$buildId/flash.sh

fi


cd $archiveDir
tar zvcf $buildId.tgz $buildId
rm -rf $buildId
cd -
ls -l $archiveDir/$buildId.tgz
