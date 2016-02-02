#! /bin/bash -e

PATH=./node_modules/.bin/:$PATH

babel-node ./src/server/main.js development &
babel-node ./src/socketio/main.js development &

wait
