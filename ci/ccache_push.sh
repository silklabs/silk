#! /bin/bash -e


SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

## This script is a helper for pushing ccache data up to our cache.

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  echo "Usage: ccache_push.sh [name (s3 folder)] [s3 bucket] [ccache dir]"
  echo "Will upload ccache directory after build..."
  exit 0
fi

name=${1:-$(basename $PWD)}
bucket=${2:-'silk-travis-artifacts-us-east-1'}
ccache_dir=${3:-"$HOME/.ccache"}
tar_name=ccache.tar.gz
tar_dest=$ROOT/ccache_dist/

mkdir -p $tar_dest

echo "folder: $name"
echo "bucket: $bucket"
echo "ccache directory: $ccache_dir"


pushd $ccache_dir
tar -czf $tar_dest/$tar_name *
popd

$ROOT/../s3-artifacts/bin/upload \
  --lossy \
  --credentials temporary_artifacts \
  $bucket \
  ccache/$name \
  $tar_dest

rm -Rf $tar_dest
