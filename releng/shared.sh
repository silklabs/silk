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
# GITS: List of projects that are branched.
# MERGE_GITS: Subset of GITS that need commits merged back to master
#             (TODO: Merge this with lib/repos.js)
#
MERGE_GITS="\
  silk-core \
  gonk-alto \
"
GITS="\
  log \
  silk-api-node \
  silk-device-locked-node-modules \
  silk-trainingset \
  $MERGE_GITS \
"

# silk-core subdirectories with a package.json at the root (ie, that are
# bootstrapped with |npm install|)
NPM_PROJECTS="\
  server \
  app \
  webapp \
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
    # Bump the version on the origin branch.  If branching from master, bump
    # the new master by a minor version.  Otherwise just bump the patch version.
    if [[ $from == master ]]; then
      ./releng/version_bump minor
    else
      ./releng/version_bump patch
    fi

    git checkout $to
    # Update version/branch to match the destination branch
    sed -i version/branch -e s/${from}/${to}/g
    local msg="Automated branch update from ${from} to ${to}"
    git commit --all -m "$msg"
  )
  popd > /dev/null
}

# Update branch references within the silk apis
updatebranch__silk_api() {
  local from=$1
  local to=$2
  for api in silk-api-node; do
    echo "Updating branch for $api: $from => $to"
    pushd $api
    (
      for js in $(find . -type f -name \*.js -o -name \*.json); do
        (
          set -x;
          sed -i $js -e "s/silk-server-[a-zA-Z0-9]*.herokuapp.com/silk-server-${to}.herokuapp.com/g"
        )
        git add $js
      done

      git commit -m "Automated branch update from ${from} to ${to}"
      git --no-pager show
    )
    popd > /dev/null
  done
}


# Update branch references for silk "npm projects" (app/server)
updatebranch__silk_npms() {
  local from=$1
  local to=$2
  pushd silk-core/
  for app in $NPM_PROJECTS; do
    echo "Updating branch for $app: $from => $to"
    pushd $app
    (
      set -x

      for package_json in package.json build/api/package.json; do
        if [[ -f $package_json ]]; then
          for p in silk-api; do
            local HEAD=$to
            if [[ $to == release ]]; then
              # Lock to SHA1 for release branch
              if [[ "$p" = "silk-api" ]]; then
                # TODO: Rename either "silk-api" or "silk-api-node" in
                # the package.json
                HEAD=$(git -C ../${p}-node rev-parse HEAD)
              else
                HEAD=$(git -C ../$p rev-parse HEAD)
              fi
            fi
            updatePackageVersion $package_json $p $HEAD
          done

          git add $package_json
        fi
      done

      local msg="${app}: Automated branch update from ${from} to ${to}"
      git commit -m "$msg"
    )
    popd > /dev/null
  done
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

    # Update the revision attribute for the all silk.xml projects on the $from
    # branch
    local silk_xml=gonk/silk/silk.xml
    if [[ ! -f $silk_xml ]]; then
      echo Error: $silk_xml does not exist.
      exit 1
    fi
    for p in $(xmlstarlet sel -t -v "//project[@revision='$from']/@name" $silk_xml); do
      local HEAD=$to
      if [[ $to == release ]]; then
        # Lock to SHA1 for release branch
        HEAD=$(git -C ../$p rev-parse HEAD)
      fi

      xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@revision" $silk_xml
      xmlstarlet ed --pf --inplace --insert "//project[@name='$p']" -t attr -n revision -v $HEAD $silk_xml

      if [[ $to == release ]]; then
        # When locking to a SHA1, ensure the "clone-depth" attribute is removed,
        # as github does not support fetching a shallow clone of a SHA1 it seems
        xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@clone-depth" $silk_xml

        # Add upstream attribute as a convenience to help decode the SHA1
        xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@upstream" $silk_xml
        xmlstarlet ed --pf --inplace --insert "//project[@name='$p']" -t attr -n upstream -v $to $silk_xml
      fi

    done

    local msg="device: Automated branch update from ${from} to ${to}"
    git commit --all -m "$msg"
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
