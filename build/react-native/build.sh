#! /bin/bash -e

root=$PWD/build/react-native
target=$root/api/
src=src/api/
dest=$1

# Create the destination directory....
mkdir -p $dest

# Compile the JS assets...
cp -R $src $target
./node_modules/.bin/browserify \
  --ignore node-fetch \
  -s silk \
  -r $target/index.js \
  -t babelify $target --o $dest/index.js

# Copy over the package.json specific to our build target.
cp $target/../package.json $dest/package.json

rm -Rf $target
