#!/bin/bash -ex

cd $(dirname $0)
cmake .
make -j$(nproc)
