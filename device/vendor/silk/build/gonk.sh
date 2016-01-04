# Figure the current Gonk from the basename of what .repo/manifest.xml is
# pointing at.
#
# Copyright (c) 2015-2016 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

source $(dirname $BASH_SOURCE)/../../../../tools/gnu.sh
GONK=$(readlink -f .repo/manifest.xml)
GONK=${GONK##*/}
GONK=${GONK%.xml}
export GONK
echo Gonk: ${GONK}
