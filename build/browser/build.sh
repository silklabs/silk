#! /bin/bash -e

if [[ "$1" == "-w" ]]; then
  maybeWatch=--watch
fi

buildroot=$PWD/build/browser

mkdir -p public/js

# silk-api
target=$buildroot/api/
rm -Rf $target
cp -R src/api $target

(
  set -x
  node ./build/overrides.js > $target/overrides.json
  ./node_modules/.bin/browserify \
    --ignore node-fetch \
    -s silk \
    -r $target/index.js \
    -t babelify $target --o public/js/silk-api.js
)
rm -Rf $target


# www js
(
  set -x
  ./node_modules/.bin/babel $maybeWatch -d public/js src/www
)
