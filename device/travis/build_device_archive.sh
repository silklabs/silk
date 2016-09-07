#!/bin/bash -e
#
# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

LOCAL_PATH=$(readlink -f $(dirname $0))

usage()
{
  [[ -z $1 ]] ||  echo "$@"
  cat <<EOF
usage: $0 <target_files.zip> <archiveName>

Builds a device build archive
EOF

  [[ -z $1 ]] || exit 1
  exit 0
}

[[ -n $1 ]] || usage
[[ -n $2 ]] || usage
[[ -f $1 ]] || usage "$1 is not a file"
TARGET_FILES_ZIP=$(readlink -f $1)
ARCHIVENAME=$2

set -x
rm -rf $ARCHIVENAME $ARCHIVENAME.tgz
mkdir $ARCHIVENAME
cd $ARCHIVENAME
unzip $TARGET_FILES_ZIP IMAGES/*
unzip $TARGET_FILES_ZIP RADIO/*
unzip $TARGET_FILES_ZIP SYSTEM/build.prop
mv SYSTEM system  # Keep qemu happy
for sh in RADIO/*.sh; do
  if [[ -f $sh ]]; then
    chmod +x $sh
    mv -v $sh .  # Surface shell scripts masquerading as radio files
  fi
done
cd ..
tar zvcf $ARCHIVENAME.tgz $ARCHIVENAME
rm -rf $ARCHIVENAME
ls -l $(readlink -f $ARCHIVENAME.tgz)
exit 0
