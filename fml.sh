#!/bin/bash -e
#
# Performs Feature Midweek Landing branching
#

BRANCH=next
ORIGIN_BRANCH=master

# Uncomment the next two lines if you are dealing with a chemspill
#BRANCH=chemspill
#ORIGIN_BRANCH=release

source shared.sh

rm -rf $BRANCH
mkdir -p $BRANCH
cd $BRANCH

clone
recreate $BRANCH $ORIGIN_BRANCH
updatebranch__silk_app $ORIGIN_BRANCH $BRANCH
updatebranch__silk_device $ORIGIN_BRANCH $BRANCH
pushf $BRANCH
