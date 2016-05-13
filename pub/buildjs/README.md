# BuildJS

A common webpack config for building a node module which may consist
of many files into a single `.js` file.

## Usage

1. If adding to a new project in silk tree add buildjs as a symlink
   dependency.

   ```js
   // (abbreviated and in js format for comments)
   {
      "scripts": {
        "postinstall": "./bin/postinstall && silk-buildjs",
        "build": "silk-buildjs"
      },
      "symlinkDependencies": {
        "silk-buildjs": "<relative path to buildjs>"
      },
   }
   ```

2. Run `npm run build` or `npm install`. The package can now also be
   invoked via the android build system (`m`, `mm`, etc...).

### Customization

Sometimes packages may need additional webpack plugins or otherwise
specify additional flags (i.e. externals). The package invoking buildjs
can add an additional `webpack.local.json` file and it will override any
default webpack options ( Feature unstable ).
