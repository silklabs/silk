#!/bin/bash -e

PATH=./node_modules/.bin/:$PATH

(
  set -x
  babel-node --harmony src/server/main.js development
)
