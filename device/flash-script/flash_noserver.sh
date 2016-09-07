#!/bin/bash -e

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

echo Pushing new build.prop ...
adb remount
adb push build.prop /system/
rm -f build.prop

echo Rebooting to apply configuration...
adb reboot
waitForDevice
echo Device provisioning successful
exit 0
