# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

export USE_CCACHE=1 # Yes please!
export CCACHE_HASHDIR=true

if [ $(uname) = "Linux" ]; then
# Avoid the nightmare of 32-bit compatibility libraries
export BUILD_HOST_64bit=1
fi

poison_their_lunch()
{
  SILK_ENVSETUP=
  echo Error: $@ >&2
  lunch() { echo Error: lunch has been disabled due to an envsetup failure;  return 1; }
  choosecombo() { lunch; }
  return 1
}

if [ $(uname) = "Darwin" ]; then
  source $(dirname $BASH_SOURCE)/gnutools.sh

  echo foo > foo
  echo FOO > FOO
  if [ "$(cat foo)" = $(cat FOO) ]; then
    if [ -z "$CI_IGNORE_CASE_INSENSITIVE_FS" ]; then
      poison_their_lunch Please use a case-sensitive file system
      return
    fi
    echo WARNING: Forcing build on case-insensitive file system
  fi
  rm -f foo FOO


  for path in $(pwd); do true; done
  if [[ "$(pwd)" != "$path" ]]; then
    poison_their_lunch Source tree path \"$(pwd)\" cannot contain a space.
    return
  fi
fi

node_version_check()
{
  local v=$(node --version)

  if [[ $v =~ ^v([0-9*])\.([0-9]*).([0-9]*)$ ]]; then
    local major=${BASH_REMATCH[1]}
    local minor=${BASH_REMATCH[2]}
    local patch=${BASH_REMATCH[3]}

    if [[ $major -eq 0 ]]; then
      [[ $minor -eq 12 ]] && return
      [[ $minor -eq 10 ]] && [[ $patch -ge 29 ]] && return
    fi
  fi
  poison_their_lunch Bad node version: $v
}

npm_version_check()
{
  local v=$(npm --version)

  if [[ $v =~ ^([0-9]*)\.([0-9]*).([0-9]*)$ ]]; then
    local major=${BASH_REMATCH[1]}
    local minor=${BASH_REMATCH[2]}
    local patch=${BASH_REMATCH[3]}

    [[ $major -eq 2 ]] && return
  fi
  poison_their_lunch Bad npm version: $v
}

cmake_version_check()
{
  if ! which cmake > /dev/null; then
    poison_their_lunch cmake not installed
    return
  fi

  local v=$(cmake --version | head -n1)

  if [[ $v =~ ^cmake\ version\ ([0-9]*)\.([0-9]*).([0-9]*) ]]; then
    local major=${BASH_REMATCH[1]}
    local minor=${BASH_REMATCH[2]}
    local patch=${BASH_REMATCH[3]}

    [[ $major -eq 3 ]] && return
    [[ $major -eq 2 ]] && [[ $minor -ge 8 ]] && return
  fi
  poison_their_lunch Unsupported cmake version: $v
}


node_version_check
[[ $? -eq 0 ]] || return
npm_version_check
[[ $? -eq 0 ]] || return
cmake_version_check
[[ $? -eq 0 ]] || return

# npm should not be making many (and ideally no) http requests during the build
# process, so enable http logging so that any unexpected network requests may be
# easily observed
export NPM_CONFIG_LOGLEVEL=http

#
#  Prepare the Gonk tree
#

# Figure the current Gonk from the basename of what .repo/manifest.xml is
# pointing at.
GONK=$(readlink -f .repo/manifest.xml)
GONK=${GONK##*/}
GONK=${GONK%.xml}
export GONK

# Traverses a manifest, outputting the name of all included manifests
find_manifest_names()
{
  local name=$1
  local xml=gonk/$1/$1.xml

  echo $name

  if [[ ! -f $xml ]]; then
    echo Error: $xml does does not exist >&2
    return
  fi
  # Notice: this "parser" does not support <include> elements spanning multiple
  # lines
  local include_xmls=$(grep '<include .*\/>' $xml | grep -o '[^"]*.xml')
  for i in $include_xmls; do
    find_manifest_names ${i%.xml}
  done
}

# Build the list of patch trees used by $GONK. Order matters here. Manifests
# listed first will take higher precedence, and its patches will replace
# patches of the same path/name of manifests lower down the list.
PATCH_TREE=
for manifest in $(find_manifest_names $GONK); do
  tree="gonk/$manifest/patch"
  if [[ -d $tree ]] && [[ ! $PATCH_TREE =~ $tree ]]; then
    PATCH_TREE+=" $tree "
  fi
done

echo Gonk: ${GONK}
if [[ ! -d gonk/${GONK} ]]; then
  poison_their_lunch Unknown gonk: $GONK
  return
elif [[ ! -f gonk/${GONK}/gonk.sh ]]; then
  poison_their_lunch gonk/${GONK} missing gonk.sh
  return
else
  source gonk/${GONK}/gonk.sh
fi

source $(dirname ${BASH_SOURCE[0]})/patchtree.sh $@

if [[ $? -eq 0 ]]; then
  # Generate manifest dependency file
  rm -f out/repo_fetchtimes.P
  for manifest in $(find_manifest_names $GONK | sort -u); do
    echo .repo/.repo_fetchtimes.json: gonk/$manifest/$manifest.xml >> out/repo_fetchtimes.P
  done

  #
  # |lunch| automatically
  #
  STAY_OFF_MY_LAWN=1 # I'm not kidding!  Setting this saves ~400ms on each build
  set_stuff_for_environment
  printconfig

  SILK_ENVSETUP=1
fi

