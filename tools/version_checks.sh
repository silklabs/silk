#!/bin/bash -e

fail()
{
  echo $0: $@ >&2
  exit 1
}

cmake_version_check()
{
  if ! which cmake > /dev/null; then
    fail cmake not installed
    return
  fi

  local v=$(cmake --version | head -n1)

  if [[ $v =~ ^cmake\ version\ ([0-9]*)\.([0-9]*).([0-9]*) ]]; then
    local major=${BASH_REMATCH[1]}
    local minor=${BASH_REMATCH[2]}
    local patch=${BASH_REMATCH[3]}

    [[ $major -eq 3 ]] && [[ $minor -ge 2 ]] && return
  fi
  fail Unsupported cmake version: $v
}

cmake_version_check

$(dirname $0)/../sdk/bin/tools_version_check.sh
exit 0
