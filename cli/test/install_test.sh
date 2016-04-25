#! /bin/bash -e

# Simulate a global npm install and run help (just to ensure we can boot).

npm install -g .
out=$(silk --help)

echo $out

function assert_contains {
  echo $out | grep -q $1
}

# Has some descriptions ...
assert_contains Silk
# Plugins are getting loaded ...
assert_contains cat
assert_contains install
assert_contains publish
assert_contains list-modules
