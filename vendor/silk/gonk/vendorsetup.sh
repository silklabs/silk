
export USE_CCACHE=1 # Yes please!

if [ $(uname) = "Darwin" ]; then
  #
  # GNU/Darwin anybody?
  #
  PACKAGES="gnu-sed coreutils findutils gnu-tar"
  for package in $PACKAGES; do
    if [ ! -d /usr/local/opt/$package ]; then
      echo
      echo Notice: /usr/local/opt/$package does not exist.  Installing $package...
      echo
      ( set -x; brew install $package )
    fi
    PATH="/usr/local/opt/$package/libexec/gnubin:$PATH"
  done

fi

poison_their_lunch()
{
  echo Error: $@ >&2
  lunch() { echo Error: lunch has been disabled due to an envsetup failure;  return 1; }
  choosecombo() { lunch; }
}

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

node_version_check
npm_version_check


# Figure the current Gonk from the basename of what .repo/manifest.xml is
# pointing at.
GONK=$(readlink -f .repo/manifest.xml)
GONK=${GONK##*/}
GONK=${GONK%.xml}
export GONK

PATCH_TREE=gonk/${GONK}/patch

echo Gonk: ${GONK}
case $GONK in
base)
  export TARGET_PRODUCT=aosp_arm
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
  PATCH_TREE=gonk/mako/patch
  ;;
*)
  poison_their_lunch Unknown gonk: $GONK
  return
  ;;
esac

source $(dirname ${BASH_SOURCE[0]})/patchtree.sh $@

if [[ $? -eq 0 ]]; then
  #
  # |lunch| automatically
  #
  STAY_OFF_MY_LAWN=1 # I'm not kidding!  Setting this saves ~400ms on each build
  set_stuff_for_environment
  printconfig
fi
