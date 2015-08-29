#! /bin/bash -ex

if [ "$TRAVIS_PULL_REQUEST" != "false" ];
then
  echo "Cannot run on pull requests."
  exit 0
fi


ok=false
for branch in master next chemspill; do
  if [ "$TRAVIS_BRANCH" = "$branch" ];
  then
    ok=true
    break
  fi
done

if ! $ok;
then
  echo "Not setup to handle branch: $TRAVIS_BRANCH"
  exit 1
fi

build() {
  local source=$1
  local build=$2
  echo "[ building $2: $1 ] start"
  ./node_modules/.bin/babel-node --harmony ./bin/publish-api \
    $source $build \
    --branch $TRAVIS_BRANCH \
    --gh-user $GITHUB_USER \
    --message "Commit for $TRAVIS_BRANCH ($TRAVIS_COMMIT_RANGE)"
  echo "[ building $2: $1 ] done"
}

build https://github.com/silklabs/silk-api-react-native react-native
build https://github.com/silklabs/silk-api-node node
