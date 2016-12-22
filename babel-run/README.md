# Babel Run utils

This folder contains various pieces to make using Babel with our Babel
preset easier, without the need for Babel configurations in every module.

## CLI

You can run scripts written in ES6 directly from the command line:

```
$ ../babel-run/babel-node my_script.js
```

The `babel-node` wrapper modifies CLI arguments as if node were
executing the script directly. If you need to run the script without
altered arguments (for e.g. `cluster.fork()` expects unaltered
arguments) you may want to use `babel-node-allargs` wrapper:

```
$ ../babel-run/babel-node-allargs my_script.js
```

## Shebang

Both `babel-node` and `babel-node-allargs` can be used in a shebang
line so you can directly create executable scripts written in ES6:

```js
#! /usr/bin/env ../pub/babel-run/babel-node

console.log(`This is ES6 Code`);
```

## Custom wrapper scripts

If you need to do additional things besides Babelifying the code, you
may want to write your own wrapper script rather than using
`babel-node` or `babel-node-allargs`.


```js
#!/usr/bin/env node

'use strict';

require('../babel-run/node')();
doAdditionalStuff();
require('./myscript');
```

## Mocha:

For example you can use the `node.js` file to setup a mocha
environment, by adding a `your-module/test/mocha.opts` file:

```
--require ../../babel-run/mocha
```

Alternatively, you can refer to a dedicated JS module to set up the
node environment if you wish to do additional stuff:

```sh
--require test/setup.js
```

`test/setup.js` would look similar to a CLI wrapper script:

```js
require('../../babel-run/node')();
doAdditionalStuff();
```
