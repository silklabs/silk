#!/bin/bash -e

LOCAL_PATH=$(readlink -f $(dirname $0))
KEYS_DIR=$LOCAL_PATH/keys
BSP_GONK=$LOCAL_PATH/../../bsp-gonk

usage() {
  [[ -z $1 ]] || echo "$@"
  cat <<EOF
usage: $0 target_files.zip

Re-signs a target_files.zip archive with the keys from
$KEYS_DIR/
EOF
  [[ -z $1 ]] || exit 1
  exit 0
}

[[ -n $1 ]] || usage
[[ -f $1 ]] || usage "$1 is not a file"
TARGET_FILES_ZIP=$1

cd $BSP_GONK
. build/envsetup.sh

set -x
rm -rf BOOT/ BOOTABLE_IMAGES/ IMAGES/ RECOVERY/

# Remove unsigned images and AOSP keys from TARGET_FILES_ZIP
zip -d $TARGET_FILES_ZIP IMAGES/* BOOTABLE_IMAGES/* {BOOT,RECOVERY}/RAMDISK/{verity_key,res/keys}

# Swap in production OTA/verity keys
cp -vf $KEYS_DIR/releasekey.pk8 build/target/product/security/testkey.pk8
cp -vf $KEYS_DIR/releasekey.x509.pem build/target/product/security/testkey.x509.pem
cp -vf $KEYS_DIR/verity* build/target/product/security/

# Rebuild res/keys file with production OTA key
rm -f $OUT/obj/PACKAGING/ota_keys_intermediates/keys
make $OUT/obj/PACKAGING/ota_keys_intermediates/keys

# Place production OTA/verity keys into TARGET_FILES_ZIP
mkdir -p {BOOT,RECOVERY}/RAMDISK/res/
cp -v $OUT/obj/PACKAGING/ota_keys_intermediates/keys BOOT/RAMDISK/res/keys
cp -v $OUT/obj/PACKAGING/ota_keys_intermediates/keys RECOVERY/RAMDISK/res/keys
cp -v build/target/product/security/verity_key BOOT/RAMDISK/
cp -v build/target/product/security/verity_key RECOVERY/RAMDISK/

zip $TARGET_FILES_ZIP {BOOT,RECOVERY}/RAMDISK/{verity_key,res/keys}

# Rebuild/sign images
rm -f signed_images.zip
./build/tools/releasetools/img_from_target_files -v $TARGET_FILES_ZIP signed_images.zip
mkdir -p IMAGES/ BOOTABLE_IMAGES/
unzip signed_images.zip -d IMAGES/
rm signed_images.zip
cp IMAGES/{boot,recovery}.img BOOTABLE_IMAGES/

# Put signed images back into TARGET_FILES_ZIP
zip $TARGET_FILES_ZIP {BOOTABLE_IMAGES,IMAGES}/*

# Sneak oem_keystore.h into the RADIO/ area to ensure that it gets picked up in
# external releases for inclusion into the ODM's bootloader
rm -rf RADIO
mkdir RADIO
cp $KEYS_DIR/oem_keystore.h RADIO
zip $TARGET_FILES_ZIP RADIO/*
rm -rf RADIO

