# Babel Run utils

This folder contains various pieces to make using babel easier from the
tree...


## Node usage:

### Mocha:

For example you can use the `node.js` file to setup a mocha environment:

`$CORE/your/module/test/setup.js`
```js
require('../../babel-run/node')();
```

`$CORE/your/module/test/mocha.opts`:

```sh
--ui tdd --require test/setup.js
```

### CLI Usage:

Or for example you want to create a CLI script which automatically
babelfies files it includes:

```js
#! /usr/bin/env node

'use strict';

require('../../babel-run/node')();

require('./your_babel_main_file.js');
```
