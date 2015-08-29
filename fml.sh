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

clone $ORIGIN_BRANCH
replace $ORIGIN_BRANCH $BRANCH
updatebranch__silk_app $ORIGIN_BRANCH $BRANCH true
updatebranch__silk_device $ORIGIN_BRANCH $BRANCH true

read -n 1 -p "Rewrite history on the branch $BRANCH?  BE SURE!!! [Ny]: "
echo
if [[ "$REPLY" != "y" ]]; then
  echo Aborted.
  exit
fi

push master
for g in $GITS; do
  (
    set -x
    pushd $g
    git push -f origin $BRANCH
    popd > /dev/null
  )
done
