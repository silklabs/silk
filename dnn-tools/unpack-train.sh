#!/bin/bash

# This script unpacks the ILSVRC2012 *training* dataset into the
# format expected by Caffe tools.  The script assumes you are in a
# directory structure that looks like the following, with the
# `ILSVRC2012_img_train.tar` file unpacked into the ilsvrc12/train/
# directory.
#
#  ilsvrc12/
#
#    train/
#      n15075141.tar
#      ...
#
#    val/
#    ...
#
# This script expects to be run from within the `ilsvrc12/train/`
# directory like so:
#
#  $ cd ilsvrc12/train/
#  $ ../unpack-train.sh
#
# The script takes a long time to run and uses many 100GBs of disk
# space.

mkdir -p ../tars-train
for f in $(ls *.tar); do
    trainingset="${f%.tar}"
    mkdir -p $trainingset
    pushd $trainingset
    tar xf ../$f
    popd
    mv $f ../tars-train
done
