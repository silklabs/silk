#
# Normalized CI environment
#

if ${CI:-false}; then
  if ${TRAVIS:-false}; then
    export CI_BRANCH=$TRAVIS_BRANCH
    export CI_BUILD_ID=$TRAVIS_BUILD_ID
    export CI_COMMIT=$TRAVIS_COMMIT
    export CI_JOB_ID=$TRAVIS_JOB_ID
    export CI_OS_NAME=$TRAVIS_OS_NAME
    export CI_PROJECT_DIR=$TRAVIS_BUILD_DIR
    export CI_PULL_REQUEST=$TRAVIS_PULL_REQUEST
    export CI_REPO_SLUG=$TRAVIS_REPO_SLUG
  fi
  if ${BUILDKITE:-false}; then
    export CI_BRANCH=$BUILDKITE_BRANCH
    export CI_BUILD_ID=$BUILDKITE_BUILD_ID
    export CI_COMMIT=$BUILDKITE_COMMIT
    export CI_JOB_ID=$BUILDKITE_JOB_ID
    export CI_OS_NAME=linux
    export CI_PROJECT_DIR=/ci # TODO...
    export CI_PULL_REQUEST=$BUILDKITE_PULL_REQUEST
    export CI_REPO_SLUG="$BUILDKITE_ORGANIZATION_SLUG/$BUILDKITE_PIPELINE_SLUG"
  fi
  if ${GITLAB_CI:-false}; then
    export CI_BRANCH=$CI_COMMIT_REF_NAME
    #CI_BUILD_ID set natively
    export CI_COMMIT=$CI_COMMIT_SHA
    #CI_JOB_ID set natively
    export CI_OS_NAME=linux
    #CI_PROJECT_DIR set natively
    export CI_PULL_REQUEST=false
    export CI_REPO_SLUG="$CI_PROJECT_NAMESPACE/$CI_PROJECT_NAME"
  fi
else
  export CI=false
  export CI_PULL_REQUEST=false
fi
