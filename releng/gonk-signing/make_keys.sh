#!/bin/bash -x
#
# Generates new device signing keys
#

LOCAL_PATH=$(readlink -f $(dirname $0))
KEYS_DIR=$LOCAL_PATH/keys
BSP_GONK=$LOCAL_PATH/../../bsp-gonk

mkdir -p $KEYS_DIR
cd $KEYS_DIR

subject='/C=US/ST=California/L=San Diego/O=Silk Labs Inc/OU=Silk/CN=silklabs.com/emailAddress=hello@silklabs.com'
for x in releasekey verity; do \
    rm -f $x.{pk8,x509.pem}
    echo | $BSP_GONK/development/tools/make_key $x "$subject"
    test -f $x.pk8 || exit 1
    test -f $x.x509.pem || exit 2
done

# Massage verity_key
make -C $BSP_GONK generate_verity_key keystore_signer BootKeystoreSigner
$BSP_GONK/out/host/linux-x86/bin/generate_verity_key -convert verity.x509.pem verity_key
mv verity_key.pub verity_key

#
# Generate oem_keystore.h for verifying the boot/recovery image from LK
#
rm -f verity.der verity_pub.der keystore.img
openssl pkcs8 -inform DER -nocrypt -in verity.pk8 -out verity.der
openssl rsa -in verity.der -pubout -outform DER -out verity_pub.der
$BSP_GONK/out/host/linux-x86/bin/keystore_signer verity.{pk8,x509.pem} keystore.img verity_pub.der
$BSP_GONK/out/host/linux-x86/bin/keystore_signer -verify keystore.img

function generate_oem_keystore_h()
{
  echo "/* bootable/bootloader/lk/platform/msm_shared/include/oem_keystore.h */"
  echo \#ifndef __OEM_KEYSTORE_H
  echo \#define __OEM_KEYSTORE_H
  xxd -i $1 | sed -e 's/unsigned char .* = {/const unsigned char OEM_KEYSTORE[] = {/g' -e 's/unsigned int .* =.*;//g'
  echo \#endif
}

generate_oem_keystore_h keystore.img > oem_keystore.h
rm -f verity.der verity_pub.der keystore.img
