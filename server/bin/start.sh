#! /bin/bash -e

PATH=./node_modules/.bin/:$PATH

babel-node --harmony src/server/main.js development &
babel-node --harmony src/socketio/main.js development &

wait
