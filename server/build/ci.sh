#! /bin/bash -ex

# Assign defaults for easier running
TRAVIS_PULL_REQUEST=${TRAVIS_PULL_REQUEST:-"false"}
TRAVIS_BRANCH=${TRAVIS_BRANCH:-"master"}
TRAVIS_COMMIT_RANGE=${TRAVIS_COMMIT_RANGE:-"testing"}

# What type of github url to construct...
repo_url_type="ssh"

publish_opts="--dry-run --no-auth"
push_branch=false

if [ "$TRAVIS_PULL_REQUEST" != "false" ];
then
  echo "Will not push on pull request..."
else
  for branch in master next chemspill; do
    if [ "$TRAVIS_BRANCH" = "$branch" ];
    then
      # Override previous opts with ones specific to pushing...
      publish_opts="--gh-user $GITHUB_USER"
      repo_url_type="https"
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
  local repo_url=$1
  local build=$2

  if [ "$repo_url_type" == "ssh" ];
  then
    repo_url="git@github.com:/$repo_url"
  elif [ "$repo_url_type" == "https" ];
  then
    repo_url="https://github.com/$repo_url"
  fi

  echo "[ building $2: $1 ] start"
  ./node_modules/.bin/babel-node --harmony ./bin/publish-api \
    $repo_url $build \
    --branch $TRAVIS_BRANCH \
    --message "Commit for $TRAVIS_BRANCH ($TRAVIS_COMMIT_RANGE)" \
    $publish_opts
  echo "[ building $2: $1 ] done"
}

build silklabs/silk-api-node api
