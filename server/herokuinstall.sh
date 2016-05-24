#! /bin/bash -ex

# Resolve to realpath....
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
cd $ROOT/../

npm build node_modules/scrypt
npm build node_modules/silk-core-version
