#! /bin/bash -e

root=$PWD/build/react-native
target=$root/api/
src=src/api/
dest=$1

cp -R $src $target
./node_modules/.bin/browserify \
  --ignore node-fetch \
  -s silk \
  -r $target/index.js \
  -t babelify $target --o $dest
rm -Rf $target
