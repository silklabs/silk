# BuildJS

A common webpack config for building a node module which may consist
of many files into a single `.js` file.

## Usage

By default this module will be used to build js modules used within the
android build system... This may be overriden by specifying an
additional npm script:

```json
{
  "scripts": {
    "silk-build-gonk": "<your override script>"
  }
}
```

Scripts will be given two arguments via the shell:

 - Absolute path to source of module
 - Absolute path to destination of module


Modules may also customize the use of webpack by adding an additional
`webpack.config.js` file to the root of the module. This file will be
mixed into the webpack.config.js within buildjs.

### Customization

Sometimes packages may need additional webpack plugins or otherwise
specify additional flags (i.e. externals). The package invoking buildjs
can add an additional `webpack.local.json` file and it will override any
default webpack options ( Feature unstable ).
