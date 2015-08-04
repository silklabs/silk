#! /bin/bash -e

root=$PWD/build/react-native
target=$root/api/
src=src/api/
dest=$1

# Create and clean destination directory....
rm -rf $dest/src/
mkdir -p $dest/src/

# Compile the JS assets...
cp -R $src $target
./node_modules/.bin/browserify \
  --ignore node-fetch \
  -s silk \
  -r $target/index.js \
  -t babelify $target --o $dest/src/index.js

# Copy over the package.json specific to our build target.
rm -f $dest/package.json
cp $target/../package.json $dest/package.json

rm -Rf $target
