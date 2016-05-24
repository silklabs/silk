#! /bin/bash -ex

./install.sh
npm run build

# Need this disk space after we finished the build ...
rm -rf $ROOT/../node_modules
