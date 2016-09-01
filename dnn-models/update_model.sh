#!/bin/bash -ex

# Fetch latest model from silk-train
if [[ ! -d train ]]; then
  git clone git@github.com:silklabs/train.git
fi

pushd train > /dev/null
git pull origin
LATEST_MODEL_SHA=$(git rev-parse HEAD)
popd > /dev/null

# Update silk-dnn model
if [[ ! -d silk-dnn ]]; then
  git clone git@github.com:silklabs/silk-dnn.git
else
  pushd silk-dnn > /dev/null
  git checkout master
  git pull origin master
  popd > /dev/null
fi

cp train/models/aristotle.caffemodel silk-dnn/models/keyword/
pushd silk-dnn/models/keyword  > /dev/null
git checkout -b update_model
git add .
git commit -m "Update keyword model with #$LATEST_MODEL_SHA"
git push origin update_model -f
LATEST_MODEL_SHA=$(git rev-parse HEAD)
git branch update_model -D
popd  > /dev/null

# Update silk-core
git checkout master
git checkout -b update_model
sed -i -e "s/\(SHA1=\).*/\1$LATEST_MODEL_SHA/" bin/sync
rm bin/sync-e
git add bin/sync
git commit -m "Update keyword model"
git push origin update_model -f
git branch update_model -D

rm -rf train
