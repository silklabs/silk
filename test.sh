#! /bin/bash -ex
target=$1

docker build -t node-build .
./build.sh $target node-build

test -f "tests/out/$target/$target.node"
