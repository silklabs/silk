#!/bin/bash -e
#
# Performs Feature Midweek Landing branching
#

usage () {
  echo "usage: $0 [-c]"
  echo
  echo Populates the next or chemspill branch
  echo c - This is chemspill, not a Feature Midweek Landing.
  echo
}

# "Feature Midweek Landing" is the default
BRANCH=next
ORIGIN_BRANCH=master

while getopts "h?c" opt; do
    case $opt in
    h|\?)
        usage
        exit 0
        ;;
    c)  BRANCH=chemspill
        ORIGIN_BRANCH=release
        ;;
    esac
done

source shared.sh

rm -rf $BRANCH
mkdir -p $BRANCH
cd $BRANCH

clone $ORIGIN_BRANCH

if [[ $ORIGIN_BRANCH == master ]]; then
  for app in $NPM_GITS; do
    pushd $app
    (
      set -ex

      git checkout $ORIGIN_BRANCH
      normalizePackageJson package.json
      git add package.json
      git commit -m "Normalize package.json" || true
    )
    popd > /dev/null
  done
fi

replace $ORIGIN_BRANCH $BRANCH

updatebranch__silk_api $ORIGIN_BRANCH $BRANCH
updatebranch__silk_npms $ORIGIN_BRANCH $BRANCH
if [[ $ORIGIN_BRANCH == master ]]; then
  # Bump the master minor version when creating a next branch
  semver_inc__silk_app master minor
else
  # Bump the chemspill patch version when branching from release
  semver_inc__silk_app chemspill patch
fi
updatebranch__silk_device $ORIGIN_BRANCH $BRANCH

read -n 1 -p "Rewrite history on the branch $BRANCH for $GITS?  BE SURE!!! [Ny]: "
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

exit 0

