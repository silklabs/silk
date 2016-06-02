#! /bin/bash -ex

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

platform=$(node -p "require('os').platform()")
project=$(node -p "require('./package.json').name")

test -d build/Release

mkdir -p dist/Release
cp build/Release/*.node dist/Release
pushd dist
tar -czf build.tar.gz Release/*
rm -rf Release
popd

$ROOT/../s3-artifacts/bin/upload \
  --lossy \
  --credentials temporary_artifacts \
  silk-travis-artifacts-us-east-1 \
  binaries/$project/$platform \
  $PWD/dist
