#! /bin/bash -ex

unzipVersion() {
  local type=$1
  local version=$2

  pushd $type
  unzip $version.zip
  rm $version.zip
  popd
}

download() {
  local version=$1

  base="https://github.com/facebook/flow/releases/download/v$version"

  curl -L "$base/flow-osx-v$version.zip/" > darwin/$version.zip
  curl -L "$base/flow-linux64-v$version.zip/" > linux/$version.zip

  unzipVersion darwin $version
  unzipVersion linux $version
}

mkdir -p darwin linux
download $(cat VERSION)

# TODO: Ideally this will bump .flow config versions.
