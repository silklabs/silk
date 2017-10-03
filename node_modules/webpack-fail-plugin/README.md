# DEPRECATED: This is default behaviour in Webpack 2.x, you probably don't need this plugin anymore.

If you're using Webpack 2+ then you shouldn't need this plugin anymore. Under normal circumstances Webpack
should already exit with a proper exit code. As such, this plugin does not officially support Webpack 2+.

If you don't get the correct exit code with Webpack 2+ then this is most likely a bug in a plugin you're using, or 
you're running into a Webpack bug. In either case I strongly recommend to isolate the problem and file issues at the
appropriate repositories. In the mean time you could try to  use this plugin as a *temporary* workaround. 

# Description

Webpack plugin that will make the process return status code 1 when it finishes with errors in single-run mode.

## Install
```
npm install webpack-fail-plugin --save-dev
```

## Usage
```javascript
var failPlugin = require('webpack-fail-plugin');

module.exports = {
	//config
	plugins: [
		failPlugin
	]
}
```

Credits to [@happypoulp](https://github.com/happypoulp).

