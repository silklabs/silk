#!/bin/bash -e

fail()
{
  echo $0: "$@" >&2
  exit 1
}

node_version_check()
{
  local v=$(node --version)

  if [[ $v =~ ^v([0-9*])\.([0-9]*).([0-9]*)$ ]]; then
    local major=${BASH_REMATCH[1]}
    [[ $major -eq 6 ]] && return
  fi
  fail Bad node version: $v
}

npm_version_check()
{
  local v=$(npm --version)

  if [[ $v =~ ^([0-9]*)\.([0-9]*).([0-9]*)$ ]]; then
    local major=${BASH_REMATCH[1]}
    [[ $major -ge 3 ]] && return
  fi
  fail Bad npm version: $v
}


node_version_check
npm_version_check

exit 0
