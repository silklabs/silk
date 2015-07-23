export USE_CCACHE=1 # Yes please!
export CCACHE_HASHDIR=true


poison_their_lunch()
{
  SILK_ENVSETUP=
  echo Error: $@ >&2
  lunch() { echo Error: lunch has been disabled due to an envsetup failure;  return 1; }
  choosecombo() { lunch; }
}

if [ $(uname) = "Darwin" ]; then
  # Ensure the host system has the right tools pre-installed
  PACKAGES="gnu-sed coreutils gnu-tar"
  for package in $PACKAGES; do
    if [ ! -d /usr/local/opt/$package/libexec/gnubin ]; then
      echo
      echo Notice: /usr/local/opt/$package/libexec/gnubin does not exist.  Installing $package...
      echo
      ( set -x; brew install $package )
    fi
    PATH="/usr/local/opt/$package/libexec/gnubin:$PATH"
  done


  echo foo > foo
  echo FOO > FOO
  if [ "$(cat foo)" = $(cat FOO) ]; then
    poison_their_lunch Please use a case-senstive file system
    return
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

    # TODO: Ensure the host node version checked here is consistent with the
    #      target node version at external/$NODE_ENGINE/
    log -p i -t silk-init Node engine missing

    if [[ "$NODE_ENGINE" = "iojs" ]]; then
      [[ $major -eq 2 ]] && [[ $minor -eq 4 ]] && return
    else
      if [[ $major -eq 0 ]]; then
        [[ $minor -eq 12 ]] && return
        [[ $minor -eq 10 ]] && [[ $patch -ge 29 ]] && return
      fi
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

# Uncomment to use iojs instead of node.
# (clean build is then recommended to ensure native node modules are rebuilt)
#export NODE_ENGINE=iojs

node_version_check
npm_version_check

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
  local xml=gonk/manifest/$1.xml

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

  echo $name
}

# Build the list of patch trees used by $GONK
PATCH_TREE=
for manifest in $(find_manifest_names $GONK | sort -u); do
  if [[ -d gonk/patch/$manifest ]]; then
    PATCH_TREE+=" gonk/patch/$manifest "
  fi
done

echo Gonk: ${GONK}
case $GONK in
base)
  export TARGET_PRODUCT=silk_arm
  export TARGET_BUILD_VARIANT=eng
  export TARGET_BUILD_TYPE=release
  ;;
mako)
  export TARGET_PRODUCT=aosp_mako
  export TARGET_BUILD_VARIANT=eng
  export TARGET_BUILD_TYPE=release
  ;;
shamu)
  export TARGET_PRODUCT=aosp_shamu
  export TARGET_BUILD_VARIANT=eng
  export TARGET_BUILD_TYPE=release
  ;;
*)
  poison_their_lunch Unknown gonk: $GONK
  return
  ;;
esac

source $(dirname ${BASH_SOURCE[0]})/patchtree.sh $@

if [[ $? -eq 0 ]]; then
  # Generate manifest dependency file
  rm -f out/repo_fetchtimes.P
  for manifest in $(find_manifest_names $GONK | sort -u); do
    echo .repo/.repo_fetchtimes.json: gonk/manifest/$manifest.xml >> out/repo_fetchtimes.P
  done

  #
  # |lunch| automatically
  #
  STAY_OFF_MY_LAWN=1 # I'm not kidding!  Setting this saves ~400ms on each build
  set_stuff_for_environment
  printconfig

  SILK_ENVSETUP=1
fi

