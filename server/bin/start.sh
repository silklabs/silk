#! /bin/bash -e

PATH=./node_modules/.bin/:$PATH

../pub/babel-run/babel-node ./src/server development &
../pub/babel-run/babel-node ./src/socketio development &
../pub/babel-run/babel-node ./src/signaling development &

wait
