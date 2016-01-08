#! /bin/bash -e

PATH=./node_modules/.bin/:$PATH

./bin/babel-node ./src/server/main.js development &
./bin/babel-node ./src/socketio/main.js development &

wait
