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
  echo "Usage: ccache_pull.sh [name (s3 folder)] [s3 bucket] [ccache dir]"
  echo "Will download ccache directory after build..."
  exit 0
fi

name=${1:-$(basename $PWD)}
bucket=${2:-'silk-travis-artifacts-us-east-1'}
ccache_dir=${3:-"$HOME/.ccache"}
tar_name=ccache.tar.gz
ccache_url="https://s3.amazonaws.com/$bucket/ccache/$name/$tar_name"

echo "folder: $name"
echo "bucket: $bucket"
echo "ccache directory: $ccache_dir"
echo "url: $ccache_url"

function get_http_status() {
  local url=$1
  curl -X HEAD -Is -w "%{http_code}" $1 -o /dev/null
}

if [[ "$(get_http_status $ccache_url)" == "200" ]];
then
  mkdir -p $ccache_dir
  cd $ccache_dir
  ( set -x; curl $ccache_url | tar -xz )
  cd -
else
  echo "Failed to find ccache bundle at $ccache_url"
fi

