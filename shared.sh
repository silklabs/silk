#
# |source| me
#

set -o pipefail

# Check for tools first
TOOLS="jq xmlstarlet"
for tool in $TOOLS; do
  if ! which $tool > /dev/null; then
    echo "Please install '$tool' to continue, maybe"
    echo "|apt-get install $tool| or |brew install $tool|"
    exit 1
  fi
done


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
  silk-webapp \
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

update_package_git_version() {
  local name=$1
  local version=$2
  jq ".dependencies[\"${name}\"]" -r package.json | cut -d# -f1
  local version_git=$(jq ".dependencies[\"${name}\"]" -r package.json | cut -d# -f1)
  jq ".dependencies[\"${name}\"] = \"${version_git}#${version}\"" -r package.json > package.json.new
  mv package.json.new package.json
}


# Update branch references within the silk apis
updatebranch__silk_api() {
  local from=$1
  local to=$2
  local ignoreOnMaster=$3
  for api in silk-api-node silk-api-react-native; do
    echo "Updating branch for $api: $from => $to"
    pushd $api
    (
      for js in $(find . -name \*.js -o -name \*.json); do
        (
          set -x;
          sed -i $js -e "s/silk-server-[a-zA-Z0-9]*.herokuapp.com/silk-server-${to}.herokuapp.com/g"
        )
        git add $js
      done

      git commit -m "Automated branch update from ${from} to ${to}"
      git --no-pager show
    )
    popd
  done
}


# Update branch references within the silk apps
updatebranch__silk_app() {
  local from=$1
  local to=$2
  local ignoreOnMaster=$3
  for app in silk-app silk-webapp; do
    echo "Updating branch for $app: $from => $to"
    pushd $app
    (
      set -x

      for p in silk-api-react-native ; do
        local HEAD=$to
        if [[ $to == release ]]; then
          # Lock to SHA1 for release branch
          HEAD=$(git -C ../$p rev-parse HEAD)
        fi
        update_package_git_version $p $HEAD
      done

      git add package.json

      git commit -m "Automated branch update from ${from} to ${to}"
      if [[ -n $ignoreOnMaster ]]; then
        ignoreHEADOnMaster
      fi
    )
    popd
  done
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

    # Update the revision attribute for the following projects in
    # gonk/manifest/silk.xml
    for p in silk-device-locked-node-modules silk-api-node; do
      local HEAD=$to
      if [[ $to == release ]]; then
        # Lock to SHA1 for release branch
        HEAD=$(git -C ../$p rev-parse HEAD)
      fi

      xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@revision" gonk/manifest/silk.xml
      xmlstarlet ed --pf --inplace --insert "//project[@name='$p']" -t attr -n revision -v $HEAD gonk/manifest/silk.xml

      if [[ $to == release ]]; then
        # When locking to a SHA1, ensure the "clone-depth" attribute is removed,
        # as github does not support fetching a shallow clone of a SHA1 it seems
        xmlstarlet ed --pf --inplace --delete "//project[@name='$p']/@clone-depth" gonk/manifest/silk.xml
      fi

    done
    git commit --all -m "Automated branch update from ${from} to ${to}"
    if [[ -n $ignoreOnMaster ]]; then
      ignoreHEADOnMaster
    fi
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

  set -x
  for g in $GITS; do
    git -C $g push origin $branch
  done
}
