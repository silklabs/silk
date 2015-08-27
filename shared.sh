#
# |source| me
#

#
# GITS: List of projects that are branched.
# MERGE_GITS: Subset of GITS that need commits merged back to master
#
# Note that these projects are sorted by the order in which the branch changes
# should be pushed
#
# Projects that depend on the branches of other projects should be listed after
# their dependant project
#
MERGE_GITS="\
  silk-server \
  silk-app \
  silk-device \
"
GITS="\
  silk-api-node \
  silk-api-react-native \
  silk-device-locked-node-modules \
  $MERGE_GITS \
"

# Fetch all the silk projects
clone() {
  local basedir=$1
  for g in $GITS; do
    (
      set -x
      git clone git@github.com:silklabs/$g.git $g
      git -C $g config --local user.email "shipit@silklabs.com"
      git -C $g config --local user.name "Release Engineering"
    )
  done
}

# Update the "current" branch references within silk-app
updatebranch__silk_app() {
  local from=$1
  local to=$2
  pushd silk-app
  (
    set -x
    sed -i package.json -e s/#${from}/#${to}/g
    git add package.json
    git commit -m "Automated branch update from ${from} to ${to}"
  )
  popd
}

# Update the "current" branch references within silk-device
updatebranch__silk_device() {
  local from=$1
  local to=$2
  pushd silk-device
  (
    set -x
    sed -i .branch -e s/${from}/${to}/g
    sed -i gonk/manifest/silk-remote.xml -e s/${from}/${to}/g
    git commit --all -m "Automated branch update from ${from} to ${to}"
  )
  popd
}

# Recreate a branch, history is destroyed
recreate() {
  local branch=$1
  local origin=$2
  for g in $GITS; do
    pushd $g
    (
      set -x
      git reset --hard HEAD
      git clean -dfx
      git checkout $origin
      git branch -D $branch || true
      git branch $branch origin/$origin
      git checkout $branch
    )
    popd
  done
}

# Force push a branch
pushf() {
  local branch=$1

  read -n 1 -p "Force push $branch?  BE SURE!!! [Ny]: "
  echo
  if [[ "$REPLY" != "y" ]]; then
    echo Aborted.
    exit
  fi

  for g in $GITS; do
    ( 
      set -x
      pushd $g
      git push -f origin $branch
      popd > /dev/null
    )
  done
}
