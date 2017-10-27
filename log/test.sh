#!/bin/bash -ex

cd $(dirname $0)

echo --- build target=web
npm run silk-build -- --target=web --no-native --no-ugly build/web
du -ha build/web/

echo --- build log shim
cmake .
make -j42

echo --- npm run mocha
npm run mocha

echo --- fin
exit 0
