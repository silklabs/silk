#! /bin/bash -e

root=$PWD/build/node
target=$root/api/
src=src/api/
dest=$1

cp -R $src $target
./node_modules/.bin/babel -d $target $target
cp -Rf $target/* $dest
rm -Rf $target
