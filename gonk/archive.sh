#!/bin/bash
#
# Copyright (c) 2015 Silk Laboratories, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Laboratories, Inc.

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

  # Create flash_fut script
  cat > $archiveDir/$TARGET_PRODUCT/flash_fut.sh <<'EOF'
#!/bin/bash

usage () {
  echo usage: $0 [-d] [-s]
  echo " "
  echo Enable easy device provisioning
  echo d - Display name for the device. Username will be used if not provided.
  echo s - Server URL. Default server URL will be used if not provided.
}

while getopts "h?d:s:" opt; do
    case $opt in
    h|\?)
        usage
        exit 0
        ;;
    d)  DISPLAY_NAME="$OPTARG"
        ;;
    s)  SERVER_URL=$OPTARG
        ;;
    esac
done

if [[ -z $DISPLAY_NAME ]]; then
  DISPLAY_NAME=$(whoami)
fi

if [[ -z $SERVER_URL ]]; then
  SERVER_URL=""
fi

# Flash the build and clear userdata/cache partitions
echo Flashing the device
cd $(dirname $0)
./flash.sh -w

adb wait-for-device
adb root
adb wait-for-device
echo Configuring the device

# Enable OTA updates
adb shell setprop persist.silk.update.enabled true

# Set device name
adb shell setprop persist.silk.displayName "$DISPLAY_NAME"

# Enable crash reporting
adb shell setprop persist.silk.crashrprt.enabled true

# Set silk-server URL
adb shell setprop persist.silk.server.url "$SERVER_URL"

# Activate uploads to cloud storage
adb shell setprop persist.silk.vidupload.enabled 1

# Enable sound on motion detection
adb shell setprop persist.silk.motion.sound true

# Restart the device
echo Waiting to reboot the device to finish provisioning
adb reboot
adb wait-for-device
echo Device provisioning successful

EOF

  chmod +x $archiveDir/$TARGET_PRODUCT/flash_fut.sh

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

set -ex
cd \$(dirname \$0)
adb wait-for-device
adb root
adb wait-for-device
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
