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

make -C $BSP_GONK generate_verity_key
$BSP_GONK/out/host/linux-x86/bin/generate_verity_key -convert verity.x509.pem verity_key
mv verity_key.pub verity_key
