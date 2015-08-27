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

# Merge $ORIGIN_BRANCH to the release branch, replacing what is currently there
updatebranch__silk_app $ORIGIN_BRANCH release
updatebranch__silk_device $ORIGIN_BRANCH release
mergerelease $ORIGIN_BRANCH release

# Turn $ORIGIN_BRANCH to something mergable back to the branch
updatebranch__silk_app release master
updatebranch__silk_device release master

read -n 1 -p "Push new release?  BE SURE!!! [Ny]: "
echo
if [[ "$REPLY" != "y" ]]; then
  echo Aborted.
  exit
fi

#!!!!!!! UNCOMMENT NEXT TWO LINES FOR A REAL RELEASE !!!!!!!
#push release
#push $ORIGIN_BRANCH

echo
echo IMPORTANT:
echo Manual steps are now required to merge $ORIGIN_BRANCH back to master for
echo the following projects: $MERGE_GITS
echo
for g in $MERGE_GITS; do
  echo
  echo Log for $g:
  git -C $g --no-pager log --graph --oneline --decorate --boundary $ORIGIN_BRANCH...origin/master
done
