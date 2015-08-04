#! /bin/bash -ex

if [ "$TRAVIS_PULL_REQUEST" != "false" ];
then
  echo "Cannot run on pull requests."
  exit 0
fi


if [ "$TRAVIS_BRANCH" != "master" ];
then
  echo "Not setup to handle non master branches"
  exit 0
fi

build() {
  local source=$1
  local build=$2
  echo "[ building $2: $1 ] start"
  ./node_modules/.bin/babel-node --harmony ./bin/publish-api \
    $source $build \
    --gh-user $GITHUB_USER \
    --message "Commit for $TRAVIS_BRANCH ($TRAVIS_COMMIT_RANGE)"
  echo "[ building $2: $1 ] done"
}

build https://github.com/silklabs/silk-api-react-native react-native
build https://github.com/silklabs/silk-api-node node
