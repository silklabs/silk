#! /bin/bash -ex
# Resolve to realpath....
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT="$( cd -P "$( dirname "$SOURCE" )" && pwd )"

# silk-svm contains models which get dynamically pulled down ... 
npm build $ROOT/../node_modules/silk-svm
# we cannot use the runtime version of silk-core-version so rebuild it ...
npm build $ROOT/../node_modules/silk-core-version

