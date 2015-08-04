#! /bin/bash -e

root=$PWD/build/node
target=$root/api/
src=src/api/
dest=$1

rm -rf $dest/src/
mkdir -p $dest/src/

cp -R $src $target
./node_modules/.bin/babel -d $target $target
cp -Rf $target/* $dest/src
# Copy over the package.json specific to our build target.
rm -f $dest/package.json
cp $target/../package.json $dest/package.json
rm -Rf $target
