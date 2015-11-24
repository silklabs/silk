#!/bin/bash -ex
#
# Force updates the stooge's master branch for all active projects.
#

branch=master
owner=silk-stooge

bin/preinstall # Setup ssh keys

# Get MERGE_GITS
SKIP_TOOL_CHECK=true
source shared.sh

# Create work area
mkdir -p $owner/$branch
cd $owner/$branch

# Update the gits
for repo in $MERGE_GITS; do
  if [[ ! -d ${repo}.git ]]; then
    git clone --bare git@github.com:silklabs/${repo}.git
    git -C ${repo}.git remote add local git@github.com:${owner}/${repo}.git
  fi
  git -C ${repo}.git fetch --verbose origin $branch
  git -C ${repo}.git push --verbose --force local FETCH_HEAD:$branch
done
