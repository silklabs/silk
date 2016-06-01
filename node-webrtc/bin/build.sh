#! /bin/bash -ex

# Builds must always occur inside of the chromium tree so we need to create a
# staging area and place ourselves inside of it along with the needed
# dependencies...

. bin/setup

function join { local IFS="$1"; shift; echo "$*"; }

build_type=${1:-Release}
build_version=${2:-51}
build_dest=build-staging
# XXX: We should not be pinned to an internal version here...
chromium_dest=$build_dest/chromium
chromium_build_dir=$SILK_WEBRTC/out/$build_type

nodewebrtc_dest=$SILK_WEBRTC/third_party/node-webrtc
node_ver=$(node -p -e 'process.versions.node')
node_dir="$HOME/.node-gyp/$node_ver"
prebuilt="build-$(./bin/arch)"
echo $prebuilt

## If we are on darwin use the prebuilt version.
if [[ -d $prebuilt && $build_version != "HEAD" ]]; then
  echo "Using prebuilt: $prebuilt"
  if [[ -L build ]]; then
    rm build
  fi
  ln -fs $prebuilt build
  exit 0
fi

## Chromium exports ...
export GYP_GENERATORS='ninja';

if [[ ! -d $SILK_WEBRTC ]]; then
  git clone $SILK_WEBRTC_SRC $SILK_WEBRTC --branch release-$build_version
  patches=( $PWD/bin/patches/*.patch )
  pushd $SILK_WEBRTC
  for patch in ${patches[@]};
  do
    git am $patch
  done
  popd
fi

# Place ourselves inside the right directory ...
ln -sf $PWD $SILK_WEBRTC/third_party/

# We need the node development headers to build ... node-gyp will helpfully
# download them and provide us a way to figure out where they live..
if [[ ! -d $node_dir ]]; then
  # We use our own node-gyp install to ensure it's present....
  ./node_modules/.bin/node-gyp install
fi

# Update clang ...
$SILK_WEBRTC/chromium/src/tools/clang/scripts/update.py


clang_path=$PWD/$SILK_WEBRTC/chromium/src/third_party/llvm-build/Release+Asserts/bin/
echo $clang_path

export CXX="ccache $clang_path/clang++ -Qunused-arguments"
export CC="ccache $clang_path/clang -Qunused-arguments"


cflags=(
  -Wno-unused-value
  -Wno-tautological-compare
  -Wno-parentheses-equality
  -Wno-deprecated-declarations
  -Wno-pointer-bool-conversion
  -Wno-array-bounds
)


# Build the gyp tree ...
$SILK_WEBRTC/webrtc/build/gyp_webrtc \
  $nodewebrtc_dest/binding.gyp \
  -Dnode_root_dir=$node_dir \
  -Dbuild_with_chromium=0 \
  -Drestrict_webrtc_logging=0 \
  -Denable_protobuf=0 \
  -Dinclude_tests=0 \
  -Ddesktop_capture_supported=1 \
  -Dbuild_libvpx=1 \
  -Dbuild_libyuv=1 \
  -Duse_sysroot=0 \
  -Dclang=1 \
  -Dclang_use_chrome_plugins=0 \
  -Drtc_use_h264=1 \
  -Duse_openh264=1 \
  -Dmac_deployment_target="10.9" \
  -Drelease_extra_cflags="$(join ' ' "${cflags[@]}")" \
  -Drestrict_webrtc_logging=0 \
  -R node-webrtc

pushd $chromium_build_dir
ninja
popd

# Blow away the build dir and symlink in node-webrtc ...
rm -rf build
ln -s $SILK_WEBRTC/out/ build
