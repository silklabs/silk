#! /bin/bash -e

# This is a silk wide eslint

projects=$(node ./tools/npm/find_packages.js)

eslint=$PWD/node_modules/.bin/eslint

for project in $projects; do
  echo "Linting: $project"
  dirs=()
  pushd $project > /dev/null

  if [ ! -f .eslintrc ]; then
    echo "XXX: $project has no .eslintrc"
    continue
  fi

  test -d src && dirs+=('src')
  test -d test && dirs+=('test')
  test -d lib && dirs+=('lib')
  test -d bin && dirs+=('bin')

  if [ -z $dirs[0] ]; then
    dirs+=('.')
  fi

  $eslint $(find . -name '*.js' -depth 1) $dirs "$@"

  popd > /dev/null
done
