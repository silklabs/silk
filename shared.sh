#
# |source| me
#

set -o pipefail

#
# GITS: List of projects that are branched.
# MERGE_GITS: Subset of GITS that need commits merged back to master
#
# Note that these projects are sorted by the order in which the branch changes
# should be pushed.  That is, projects that depend on the branches of other
# projects should be listed after their dependant project.
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

nostragglers() {
  local branch=$1
  ok=true
  for g in $MERGE_GITS; do
    if [[ $(git -C $g cherry origin/master $branch | wc -l) -ne 0 ]]; then
      echo Error: Refusing to continue until all commits from
      echo $branch have been merged back into master:
      echo
      git -C $g cherry -v origin/master $branch
      echo
      ok=false
    fi
  done

  $ok || exit 1
}

ignoreHEADOnMaster() {
  local SHA1=$(git rev-parse --short HEAD)
  git checkout master
  git merge $SHA1 -s ours -m "Ignore $SHA1 (Automated branch update from ${from} to ${to})"
  git checkout $from
}

# Update branch references within silk-app
updatebranch__silk_app() {
  local from=$1
  local to=$2
  local ignoreOnMaster=$3
  echo "Updating branch for silk-app: $from => $to"
  pushd silk-app
  (
    set -x
    sed -i package.json -e s/#${from}/#${to}/g
    git add package.json
    git commit -m "Automated branch update from ${from} to ${to}"
    if [[ -n $ignoreOnMaster ]]; then
      ignoreHEADOnMaster
    fi
  )
  popd
}

# Bumps the version of silk-app for given branch
semver_inc__silk_app() {
  local branch=$1
  local level=$2
  local ignoreOnMaster=$3
  pushd silk-app
  (
    set -x
    git checkout $branch

    local ver=$(cat iOS/Info.plist | \
      sed -n -e 's#\t<string>\([0-9][0-9]*.[0-9][0-9]*.[0-9][0-9]*\)</string>#\1#p' | \
      head -n1)

    if [[ "$ver" == "" ]]; then
      echo Error: unable to determine app version
      exit
    fi

    mkdir -p node_modules
    npm install semver --loglevel http
    local nextver=$(./node_modules/.bin/semver $ver -i $level)

    sed -e "s/$ver/$nextver/" -i iOS/Info.plist
    git add iOS/Info.plist
    git commit -m "Automated version update from ${ver} to ${nextver}"
    if [[ $branch != master ]]; then
      ignoreHEADOnMaster
    fi
  )
  popd
}

# Update branch references within silk-device
updatebranch__silk_device() {
  local from=$1
  local to=$2
  local ignoreOnMaster=$3
  echo "Updating branch for silk-device: $from => $to"
  pushd silk-device
  (
    set -x
    sed -i .branch -e s/${from}/${to}/g
    sed -i gonk/manifest/silk-remote.xml -e s/${from}/${to}/g
    git commit --all -m "Automated branch update from ${from} to ${to}"
    if [[ -n $ignoreOnMaster ]]; then
      ignoreHEADOnMaster
    fi
  )
  popd
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
      git branch $to origin/$from
      git checkout $to
    )
    popd
  done
}

# Merge one branch into another overwriting what was in the destination branch.
# History is preserved.
mergerelease() {
  local from=$1
  local to=$2
  for g in $GITS; do
    pushd $g
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
    popd
  done
}


# Push a branch
push() {
  local branch=$1

  for g in $GITS; do
    (
      set -x
      pushd $g
      git push origin $branch
      popd > /dev/null
    )
  done
}
