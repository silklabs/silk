#!/bin/bash -ex

# Simulate a global npm install and run help (just to ensure we can boot).
cd $(dirname $0)/..

# Pull down dev dependencies before 'install -g'
npm install .

MAYBE_SUDO=
if ${BUILDKITE:-false}; then
  MAYBE_SUDO=sudo
fi
$MAYBE_SUDO npm install -g .

which silk
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
