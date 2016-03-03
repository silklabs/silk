#! /bin/bash -ex

target=$1
image=${image:-lightsofapollo/node-build}

if [ ! -d tests/node_modules/$target ];
then
  pushd tests
  rm -rf node_modules
  # Install but do not actually run scripts ...
  npm install --ignore-scripts
  popd
fi

if [ "$(uname)" != "Darwin" ];
then
  echo "You must run these scripts from OSX"
  exit 1
fi

docker build -t node-build .
rm -rf tests/out
mkdir -p tests/out

id=$(docker create node-build)
docker cp tests/node_modules/$target/ $id:/workspace/
docker start $id

if [[ "$(docker wait $id)" != "0" ]]; then
  docker logs $id
  docker rm $id
  exit 1
fi

docker cp $id:/workspace/$target/build/build-linux-x64 tests/out/$target
docker logs $id
docker rm $id
