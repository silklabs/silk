#! /bin/bash -ex

# Assign defaults for easier running
TRAVIS_PULL_REQUEST=${TRAVIS_PULL_REQUEST:-"false"}
TRAVIS_BRANCH=${TRAVIS_BRANCH:-"master"}
GITHUB_USER=${GITHUB_USER:-"autogenbot"}
TRAVIS_COMMIT_RANGE=${TRAVIS_COMMIT_RANGE:-"testing"}

publish_opts="--dry-run"
push_branch=false

if [ "$TRAVIS_PULL_REQUEST" != "false" ];
then
  echo "Will not push on pull request..."
else
  for branch in master next chemspill; do
    if [ "$TRAVIS_BRANCH" = "$branch" ];
    then
      publish_opts=""
      push_branch=true
      break
    fi
  done

  if ! $push_branch;
  then
    echo "Will not push on branch $TRAVIS_BRANCH"
  fi
fi

build() {
  local source=$1
  local build=$2
  echo "[ building $2: $1 ] start"
  ./node_modules/.bin/babel-node --harmony ./bin/publish-api \
    $source $build \
    --branch $TRAVIS_BRANCH \
    --gh-user $GITHUB_USER \
    --message "Commit for $TRAVIS_BRANCH ($TRAVIS_COMMIT_RANGE)" \
    $publish_opts
  echo "[ building $2: $1 ] done"
}

build https://github.com/silklabs/silk-api-react-native react-native
build https://github.com/silklabs/silk-api-node node
