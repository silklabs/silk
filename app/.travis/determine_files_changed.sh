# See https://github.com/travis-ci/travis-ci/issues/4596 for why the
# substitution is necessary.
JS_CHANGES=`git diff --name-only ${TRAVIS_COMMIT_RANGE/.../..} | grep "^app/src/"`
NON_JS_CHANGES=`git diff --name-only ${TRAVIS_COMMIT_RANGE/.../..} | grep -v "^app/src/"`

echo -e "Pull Request: $TRAVIS_PULL_REQUEST\n"
echo -e "JS changes:\n$JS_CHANGES\n"
echo -e "Non-JS changes:\n$NON_JS_CHANGES\n"
