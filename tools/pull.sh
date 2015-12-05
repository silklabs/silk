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
  git subtree merge \
    --prefix $subtree \
    -m "Merge branch 'master' of github.com/silklabs/silk-$subtree" \
    remotes/silk-$subtree/master
done

for subtree in releng; do
  git remote remove $subtree
  git remote add -f $subtree git@github.com:silklabs/$subtree.git
  git subtree merge \
    --prefix $subtree \
    -m "Merge branch 'master' of github.com/silklabs/$subtree" \
    remotes/$subtree/master
done
