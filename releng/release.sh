#!/bin/bash -e
#
# Turns the tip of a next or chemspill branch into a release
#

usage () {
  echo "usage: $0 [-c]"
  echo
  echo Turns the tip of a next or chemspill branch into a release
  echo c - This is chemspill
  echo
}

# Normal release is the default
ORIGIN_BRANCH=next

while getopts "h?c" opt; do
  case $opt in
  h|\?)
    usage
    exit 0
    ;;
  c) ORIGIN_BRANCH=chemspill
    ;;
  esac
done


source shared.sh

rm -rf release
mkdir -p release
cd release

clone $ORIGIN_BRANCH

# Merge $ORIGIN_BRANCH to the release branch, replacing what is currently there
updatebranch__silk_core $ORIGIN_BRANCH release
updatebranch__silk_device $ORIGIN_BRANCH release

mergerelease $ORIGIN_BRANCH release

read -n 1 -p "Push new release?  BE SURE!!! [Ny]: "
echo
if [[ "$REPLY" != "y" ]]; then
  echo Aborted.
  exit
fi

push release

set +x
echo
RELEASE_SHA1=$(git -C silk-core rev-parse --short HEAD)
echo Released to:
echo "* https://github.com/silklabs/silk-core/commit/$RELEASE_SHA1"
echo
echo To reproduce this release:
echo "  git clone --no-checkout git@github.com:silklabs/silk-core.git"
echo "  git -C silk-core checkout $RELEASE_SHA1"

exit 0
