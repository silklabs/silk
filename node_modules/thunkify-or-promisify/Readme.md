### Deprecated, use [thenify](https://github.com/thenables/thenify) or [thenify-all](https://github.com/thenables/thenify-all)

[![NPM version][npm-img]][npm-url]
[![Build status][travis-img]][travis-url]
[![Test coverage][coveralls-img]][coveralls-url]
[![License][license-img]][license-url]
[![Dependency status][david-img]][david-url]

### thunkify-or-promisify
thunkify or promisify a callback style function

```js
var wrapper = require('thunkify-or-promisify');

/**
 * @param origin  {function | object}
 * @param type    {string}           - optional ('thunk': thunkify, any other values: promisify)
 * @param ignores {array}            - optional (ignore some functional properties of object)
 *
 * wrapper(origin, type, ignores)
 */

// promisify
fn = wrapper(fn);
wrapper(object);

// thunkify
fn = wrapper(fn, 'thunk');
wrapper(object, 'thunk');
```

[npm-img]: https://img.shields.io/npm/v/thunkify-or-promisify.svg?style=flat-square
[npm-url]: https://npmjs.org/package/thunkify-or-promisify
[travis-img]: https://img.shields.io/travis/coderhaoxin/thunkify-or-promisify.svg?style=flat-square
[travis-url]: https://travis-ci.org/coderhaoxin/thunkify-or-promisify
[coveralls-img]: https://img.shields.io/coveralls/coderhaoxin/thunkify-or-promisify.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/coderhaoxin/thunkify-or-promisify?branch=master
[license-img]: https://img.shields.io/badge/license-MIT-green.svg?style=flat-square
[license-url]: http://opensource.org/licenses/MIT
[david-img]: https://img.shields.io/david/coderhaoxin/thunkify-or-promisify.svg?style=flat-square
[david-url]: https://david-dm.org/coderhaoxin/thunkify-or-promisify

### License
MIT
