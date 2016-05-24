#! /bin/bash -e

# Ensure we run in same environment as humans ...
#source ../setup
help=$(../pub/cli/silk -h)

function assert_contains {
  echo $help | grep -q $1
}

function assert_not_contains {
  echo $help | grep -q -v $1
}

assert_contains init
assert_contains Silk
assert_contains help
assert_not_contains WARN
assert_not_contains ERROR
assert_not_contains FATAL
