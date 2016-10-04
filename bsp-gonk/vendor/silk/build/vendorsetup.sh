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

if [ -f ../setup ]; then
  source ../setup
fi
source ../tools/gnu.sh

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

../tools/version_checks.sh
if [[ $? -ne 0 ]]; then
  poison_their_lunch Host tools are incorrect.
  return
fi

# npm should not be making many (and ideally no) http requests during the build
# process, so enable http logging so that any unexpected network requests may be
# easily observed
export NPM_CONFIG_LOGLEVEL=http

#
#  Prepare the BSP tree
#

if [[ ! -L .repo/board ]] || [[ ! -L .repo/product ]]; then
  poison_their_lunch Please run ./sync
fi
export SILK_BOARD=$(readlink .repo/board)
export SILK_PRODUCT=$(readlink .repo/product)

if [[ ! -d board/$SILK_BOARD ]]; then
  poison_their_lunch Unknown board: $SILK_BOARD
  return
fi
if [[ ! -f board/$SILK_BOARD/gonk.sh ]]; then
  poison_their_lunch board/$SILK_BOARD/gonk.sh not found
  return
fi
if [[ ! -f board/$SILK_BOARD/$SILK_BOARD.xml ]]; then
  poison_their_lunch board/$SILK_BOARD/$SILK_BOARD.xml not found
  return
fi
if [[ ! -d product/$SILK_PRODUCT ]]; then
  poison_their_lunch Unknown product: $SILK_PRODUCT
  return
fi
if [[ ! -f product/$SILK_PRODUCT/$SILK_PRODUCT.xml ]]; then
  poison_their_lunch product/$SILK_PRODUCT/$SILK_PRODUCT.xml not found
  return
fi


if [[ "$NODE_ENV" = "production" ]]; then
  export TARGET_BUILD_VARIANT=user
else
  export TARGET_BUILD_VARIANT=userdebug
fi
export TARGET_BUILD_TYPE=release
source board/$SILK_BOARD/gonk.sh

# Traverses a manifest, outputting the name of all included manifests
find_included_manifests()
{
  local xml=$1
  echo $xml
  if [[ ! -r $xml ]]; then
    echo Error: $xml does not exist >&2
    return
  fi
  # Notice: this "parser" does not support <include> elements spanning multiple
  # lines
  local include_xmls=$(grep '<include .*\/>' $xml | grep -o '[^"]*.xml')
  for i in $include_xmls; do
    local basename=${i%.xml}
    if [[ -r board/$basename/$i ]]; then
      find_included_manifests board/$basename/$i
    elif [[ -r product/$basename/$i ]]; then
      find_included_manifests product/$basename/$i
    else
      echo Error: $xml includes an unknown file: $i >&2
      return
    fi
  done
}

# Build the list of patch trees used by the board/product. Order matters here.
# Manifests listed first will take higher precedence, and its patches will
# replace patches of the same path/name of manifests lower down the list.
PATCH_TREE=
MANIFEST_DEPS="board/$SILK_BOARD/$SILK_BOARD.xml product/$SILK_PRODUCT/$SILK_PRODUCT.xml"
for manifest in $(find_included_manifests board/$SILK_BOARD/$SILK_BOARD.xml) \
                $(find_included_manifests product/$SILK_PRODUCT/$SILK_PRODUCT.xml); do
  MANIFEST_DEPS="$MANIFEST_DEPS $manifest"

  _tree="$(dirname $manifest)/patch"
  if [[ -d $_tree ]] && [[ ! $PATCH_TREE =~ $_tree ]]; then
    PATCH_TREE+=" $_tree "
  fi
done

# Generate manifest dependency file
echo .repo/lastsync: $MANIFEST_DEPS > .repo/manifest.deps

source $(dirname ${BASH_SOURCE[0]})/patchtree.sh $@
[[ $? -eq 0 ]] || return

#
# |lunch| automatically
#
STAY_OFF_MY_LAWN=1 # I'm not kidding!  Setting this saves ~400ms on each build
set_stuff_for_environment
printconfig

export SILK_ENVSETUP=1
