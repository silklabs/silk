#!/bin/bash

SUBTREES="\
  app\
  device\
  server\
  webapp\
"

for subtree in $SUBTREES; do
  git remote remove silk-$subtree
  git remote add -f silk-$subtree git@github.com:silklabs/silk-$subtree.git
  git merge \
    -s subtree \
    -m "Merge branch 'master' of github.com/silklabs/silk-$subtree" \
    remotes/silk-$subtree/master
done
