#! /bin/bash -e

PATH=./node_modules/.bin/:$PATH

../babel-run/babel-node ./src/server development &
../babel-run/babel-node ./src/socketio development &
../babel-run/babel-node ./src/signaling development &

wait
