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
node ./build/overrides.js > $dest/src/overrides.json
# Copy over the package.json specific to our build target.
rm -f $dest/package.json
cp $target/../package.json $dest/package.json

# Reuse jsonwebtoken from ../package.json. The node API's package.json does not reference our
# patched version of jsonwebtoken:
#
#    "jsonwebtoken": "git@github.com:silklabs/node-jsonwebtoken.git#12168fc568e299565b3824f79fc956890dcab87c",
#
# because using a git SHA1 as a version causes unwanted network activity during
# device builds -- on every |npm install|, npm wants to reach out to github.
# Once our jsonwebtoken patches have been upstreamed and we can return to using
# a jsonwebtoken fetched from npmjs, this |rsync| should be removed and
# "jsonwebtoken" restored as a proper dependency in package.json
rsync -a node_modules/jsonwebtoken $dest/node_modules

rm -Rf $target
