#!/bin/sh
if [ -z "$CAFFE_ROOT" ]; then
  git clone --depth 1 git@github.com:BVLC/caffe.git
  cd caffe
  cp ../Makefile.config-caffe Makefile.config
  make -j16 dist
fi
