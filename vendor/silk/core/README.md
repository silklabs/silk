# silk-core

## Javascript Rapid Dev Cycle:

If you are only making JavaScript changes in `lib/`, the following development
cycle may be used to reduce your build times significantly

```sh
.. edit .js files ..
$ npm install
$ adb push core.js /system/silk/
$ adb shell setprop ctl.restart silk
```

## Adding new package dependencies

Package dependencies of core need to be managed carefully to ensure reproducible
builds.

Generally whenever a new dependency is added to *package.json*, also run `make
import_node_modules` to ensure the new package is also imported into the source
tree.
