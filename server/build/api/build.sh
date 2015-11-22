#! /bin/bash -e

root=$(dirname $0)
src=src/api/
dest=$1

rm -rf $dest/src/
mkdir -p $dest/src/

cp -Rf $src/* $dest/src
node ./build/overrides.js > $dest/src/overrides.json
# Copy over the package.json specific to our build target.
rm -f $dest/package.json
cp $root/package.json $dest/package.json

# Install all dependencies for the client as not all dependencies may be easily
# accessible (eg, private git URLs such as silklabs/node-jsonwebtoken and
# silklabs/node-jws)
cd $dest
npm install --loglevel http
