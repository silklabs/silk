# babel-preset-es2015-node

> Babel preset for all es2015 plugins needed with latest stable node.

This preset determines which node version you are using via `process.version` and accordingly sets the necessary ES2015 Babel plugins.

All versions of node >=4 are supported.

## Install
```sh
$ npm install --save-dev babel-preset-es2015-node
```

## Usage

### Via `.babelrc` (Recommended)

**.babelrc**

```json
{
  "presets": ["es2015-node"]
}
```

### Via CLI

```sh
$ babel script.js --preset es2015-node
```

### Via Node API

```javascript
require("babel-core").transform("code", {
  presets: ["es2015-node"]
});
```
