#!/bin/bash -e

dest=$1
cd $ANDROID_BUILD_TOP

ensure_img() {
  local name=$1
  if [[ ! -f $ANDROID_PRODUCT_OUT/$name ]]; then
    echo "Image $name is missing for $SILK_BOARD"
    exit 1
  fi
}

ensure_img boot.img
ensure_img system.img

cp -r $ANDROID_PRODUCT_OUT/{*.img,system/build.prop} $dest
./repo manifest -r -o - > $dest/versioned.xml

# Create flash script
cat > $dest/flash.sh <<'EOF'
#/bin/sh

set -x
cd $(dirname $0)
adb reboot-bootloader
fastboot oem unlock
set -e
fastboot flash boot boot.img
fastboot flash system system.img
if [ -f recovery.img ]; then
  fastboot flash recovery recovery.img
fi

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

chmod +x $dest/flash.sh
