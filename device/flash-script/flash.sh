#/bin/bash

set -x
cd $(dirname $0)
adb reboot-bootloader
fastboot oem unlock

FULL=false
WIPE=false
if [ "$1" = "-f" ]; then
  shift
  WIPE=true
  if [ -d RADIO ]; then
    FULL=true
  else
    echo "No RADIO/ found"
  fi
fi
if [ "$1" = "-w" ]; then
  WIPE=true
fi


set -e
if $FULL; then
  cd RADIO
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
fastboot flash boot IMAGES/boot.img
fastboot flash system IMAGES/system.img
if [ -r IMAGES/recovery.img ]; then
  fastboot flash recovery IMAGES/recovery.img
fi
if [ -r IMAGES/splash.img ]; then
  fastboot flash splash IMAGES/splash.img
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

exit 0
