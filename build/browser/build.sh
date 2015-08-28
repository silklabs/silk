#! /bin/bash -e

root=$PWD/build/browser
target=$root/api/
src=src/api/
dest=$1

cp -R $src $target
node ./build/overrides.js > $target/overrides.json

./node_modules/.bin/browserify \
  --ignore node-fetch \
  -s silk \
  -r $target/index.js \
  -t babelify $target --o $dest
rm -Rf $target
