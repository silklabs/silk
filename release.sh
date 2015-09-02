#!/bin/bash -e
#
# Turns the tip of a next or chemspill branch into a release
#

ORIGIN_BRANCH=next
# Uncomment the next line if you are dealing with a chemspill release
#ORIGIN_BRANCH=chemspill

source shared.sh

rm -rf $ORIGIN_BRANCH
mkdir -p $ORIGIN_BRANCH
cd $ORIGIN_BRANCH

clone $ORIGIN_BRANCH
nostragglers $ORIGIN_BRANCH

# Merge $ORIGIN_BRANCH to the release branch, replacing what is currently there
updatebranch__silk_app $ORIGIN_BRANCH release
updatebranch__silk_device $ORIGIN_BRANCH release
mergerelease $ORIGIN_BRANCH release

read -n 1 -p "Push new release?  BE SURE!!! [Ny]: "
echo
if [[ "$REPLY" != "y" ]]; then
  echo Aborted.
  exit
fi

push release

echo Notice: $ORIGIN_BRANCH is now defunct and should be deleted from the
echo following projects to avoid confusion:
for g in $MERGE_GITS; do
  echo "  https://github.com/silklabs/$g/branches"
done
