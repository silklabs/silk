#
# |source| me
#

set -o pipefail

if [[ -z $SKIP_TOOL_CHECK ]]; then
  NODE_MODULES_BIN=$(dirname $(readlink -f $0))/node_modules/.bin/
  if [[ ! -d $NODE_MODULES_BIN ]]; then
    echo "$NODE_MODULES_BIN not found, please run |npm install|"
    exit 1
  fi

  # Check for tools first
  PATH=$PATH:$NODE_MODULES_BIN
  TOOLS="jq xmlstarlet sort-json"
  for tool in $TOOLS; do
    if ! which $tool > /dev/null; then
      echo "Please install '$tool' to continue, maybe"
      echo "|apt-get install $tool| or |brew install $tool|"
      exit 1
    fi
  done
fi

#
# GITS: List of all projects that are branched.
#

GITS="\
  boost \
  cereproc \
  gonk-msm8956 \
  libwebrtc \
  node-webrtc \
  pandohub-blobs \
  pandohub-nhlos \
  qualcomm-developer-network \
  release-pando-gonk-caf.msm8909-la121 \
  release-pando-gonk-caf.pandohub \
  release-pando-gonk-msm8909-la121-patch-vqp \
  silk-core \
  silk-dnn \
  silk-trainingset \
  vendor-qcom-msm8956 \
  vendor-qcom-proprietary.msm8909-la121 \
"

# Fetch all the silk projects
clone() {
  local origin=$1
  for g in $GITS; do
    (
      set -x
      git clone -b $origin git@github.com:silklabs/$g.git $g
      git -C $g config --local user.email "shipit@silklabs.com"
      git -C $g config --local user.name "Release Engineering"
    )
  done
}

normalizePackageJson() {
  sort-json $1
}

updatePackageVersion() {
  local package_json=$1
  local name=$2
  local version=$3

  local version_git=$(jq ".dependencies[\"${name}\"]" -r $package_json | cut -d# -f1)
  if [[ "$version_git" == "null" ]]; then
    return
  fi
  jq ".dependencies[\"${name}\"] = \"${version_git}#${version}\"" -r $package_json > package.new.json
  mv package.new.json $package_json
  normalizePackageJson $package_json
}

updatebranch__silk_core() {
  local from=$1
  local to=$2
  echo "Updating branch: $from => $to"
  pushd silk-core
  (
    set -ex

    git checkout $from

    # If branching from master, bump the master minor version for the next
    # release cycle.
    if [[ $from == master ]]; then
      ./releng/version_bump minor
    fi

    if [[ $to != release ]]; then
      git checkout $to
    fi
    # Update pub/version/branch to match the destination branch
    sed -i pub/version/branch -e s/${from}/${to}/g
    local msg="Automated branch update from ${from} to ${to}"
    git commit --all -m "$msg"

    # Bump patch version of the destination branch to ensure it has a
    # greater version than the origin branch.
    ./releng/version_bump patch
  )
  popd > /dev/null
}


# Update branch references within silk-device
updatebranch__silk_device() {
  local from=$1
  local to=$2
  echo "Updating branch for silk-device: $from => $to"
  pushd silk-core/device
  (
    set -x

    # Update the revision attribute for the all projects on the $from branch
    for product in silk fuhuhub; do
      local product_xml=product/$product/${product}.xml
      if [[ ! -f $product_xml ]]; then
        echo Error: $product_xml does not exist.
        exit 1
      fi
      for p in $(xmlstarlet sel -t -v "//project[@revision='$from']/@name" $product_xml); do

        # All the silk.xml projects that are about to get their revisions updated
        # should be in the list of projects that are getting branched, to ensure
        # the updated revision actually exists.
        if [ ! -d ../../$p ]; then
          echo "Error: $p not listed in GITS variable?"
          echo "       ../../$p not a directory ($(readlink -f ../../$p))"

          # Whitelist pandohub-dialogscript as it is mirrored from an external
          # source and should not be manhandled by Releng.
          [[ "$p" == "pandohub-dialogscript" ]] || exit 1
        fi

        local HEAD=$to
        if [[ $to == release ]]; then
          # Lock to SHA1 for release branch
          HEAD=$(git -C ../../$p rev-parse HEAD)
        fi

        xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@revision" $product_xml
        xmlstarlet ed --pf --inplace --insert "//project[@name='$p']" -t attr -n revision -v $HEAD $product_xml

        if [[ $to == release ]]; then
          # When locking to a SHA1, ensure the "clone-depth" attribute is removed,
          # as github does not support fetching a shallow clone of a SHA1 it seems
          xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@clone-depth" $product_xml

          # Add upstream attribute as a convenience to help decode the SHA1
          xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@upstream" $product_xml
          xmlstarlet ed --pf --inplace --insert "//project[@name='$p']" -t attr -n upstream -v $to $product_xml
        fi

      done
    done

    local msg="device: Automated branch update from ${from} to ${to}"
    git commit --all -m "$msg" || true
  )
  popd > /dev/null
}

# Replace the contents of a branch. History is destroyed.
replace() {
  local from=$1
  local to=$2
  for g in $GITS; do
    pushd $g
    (
      set -x
      git reset --hard HEAD
      git clean -dfx
      git checkout $from
      git branch -D $to || true
      git branch $to $from
      git checkout $to
    )
    popd > /dev/null
  done
}

# Merge one branch into another overwriting what was in the destination branch.
# History is preserved.
mergerelease() {
  local from=$1
  local to=$2

  for g in $GITS; do
    pushd $g
    if ! git diff --name-only --exit-code origin/$to origin/$from; then
      echo $g: merging $from into $to
      (
        set -x

        #
        # http://stackoverflow.com/questions/173919/is-there-a-theirs-version-of-git-merge-s-ours
        #
        git checkout $to || git branch $to  #<!-- TODO: Remove this line after first release is made
        git checkout $to
        git merge -s ours $from -m "Automated release"
        git branch -D tmp || true
        git branch tmp
        git reset --hard $from
        git reset --soft tmp
        git commit --amend -C HEAD
        git branch -D tmp
        git diff HEAD $from

        # Fix release commit message
        echo "Automated release" > msg
        echo >> msg
        git shortlog ${to}~1..${to} >> msg
        git commit --amend -F msg
      )
    else
      git checkout $to # Ensure the $to branch exists locally
      echo $g: NOT merging $from into $to, no changes
    fi
    popd > /dev/null
  done
}


# Push a branch
push() {
  local branch=$1

  set -x
  for g in $GITS; do
    git -C $g push origin $branch
  done
}
