#!/bin/bash

read -p "'zest' is about to blow away everything in this repo.  You'll have to re-clone everything you've already cloned.  All your untracked files will be deleted.  Any un-pushed modifications to tracked files will be lost.  ARE YOU SURE YOU WANT TO DO THIS? [Yes/no] " answer

set -x

if [[ "$answer" != "Yes" ]]; then
  echo "OK, aborting"
  exit 0
fi

git reset --hard HEAD
git clean -dffx
echo https://youtu.be/1r_2fNiYkyE
