#! /bin/bash -e

PATH=./node_modules/.bin/:$PATH

../babel-run/babel-node ./src/server/main.js development &
../babel-run/babel-node ./src/socketio/main.js development &

wait
