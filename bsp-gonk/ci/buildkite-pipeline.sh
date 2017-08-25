#!/bin/bash

cd $(dirname $0)/..
source ../version/branch

echo steps:

function build() {
  BOARD=$1
  PRODUCT=${2:-gonkjs}
  VARIANT=${3:-userdebug}

cat <<EOF
  - command: "pub/bsp-gonk/ci/script $BOARD $PRODUCT $VARIANT"
    label: "$BOARD-$PRODUCT-$VARIANT"
    agents:
      - "docker=true"
      - "device-build=true"
    timeout: 120

EOF
}

build qemu

if [[ $BRANCH == master ]] && [[ $CI_PULL_REQUEST = false ]]; then
  build mako
  build kenzo
  build qemu-n

  # TODO: Build the secondary boards periodically
#  build aospkeno
#  build aries
#  build hammerhead
#  build oneplus3
#  build shamu
fi

exit 0
