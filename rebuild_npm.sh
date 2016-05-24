#! /bin/bash -ex

## This helper is primary used to rebuild the npm cache in a disaster or
## development situation where we want to upgrade the entire node_modules
## structure from scratch ...

directories=(
  pub/cli
  http
  azure-storage
  api
  api-schema
  server
  streams
  s3-artifacts
)

for dir in "${directories[@]}"; do
  silk npm-install $dir
done
