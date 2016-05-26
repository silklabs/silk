#! /bin/bash -ex

function assert_contains {
  echo $1 | grep -q $2
}

test_buildtrigger() {
  out=$(npm run buildtrigger -- --help)
  assert_contains "$out" 'buildtrigger'
  assert_contains "$out" 'Examples'
}


test_webpack() {
  ./node_modules/.bin/webpack --progress
}

test_buildtrigger
test_webpack
