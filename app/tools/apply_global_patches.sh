#!/bin/bash -ex

patches=( $(dirname $0)/global_patches/*.patch )
for patch in ${patches[@]};
do
  patch -N -p0 -i $patch || echo
done
