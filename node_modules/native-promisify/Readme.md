### Deprecated, please use [thenify](https://github.com/thenables/thenify) or [thenify-all](https://github.com/thenables/thenify-all)

[![NPM version][npm-img]][npm-url]
[![Build status][travis-img]][travis-url]
[![Test coverage][coveralls-img]][coveralls-url]
[![License][license-img]][license-url]
[![Dependency status][david-img]][david-url]

### native-promisify

```js
var promisify = require('native-promisify');
```

* promisify function

```js
function fn(ms, cb) {
  setTimeout(cb(null, ms), ms);
}

var p = promisify(fn);

p(10).then(function(ms) {
  console.log('delay: %d', ms);
});
```

* promisify object

```js
var obj = {
  name: 'hello',
  show: fun1,
  tell: fun2,
  ping: fun3
};

// promisify all functions (exclude generator function) of the object
promisify(origin);

// only promisify `show`, `tell`
promisify(origin, ['show', 'tell']);

// filter function
promisify(origin, function(key) {
  return key === 'ping';
});
```

### License
MIT

[npm-img]: https://img.shields.io/npm/v/native-promisify.svg?style=flat-square
[npm-url]: https://npmjs.org/package/native-promisify
[travis-img]: https://img.shields.io/travis/coderhaoxin/native-promisify.svg?style=flat-square
[travis-url]: https://travis-ci.org/coderhaoxin/native-promisify
[coveralls-img]: https://img.shields.io/coveralls/coderhaoxin/native-promisify.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/coderhaoxin/native-promisify?branch=master
[license-img]: https://img.shields.io/badge/license-MIT-green.svg?style=flat-square
[license-url]: http://opensource.org/licenses/MIT
[david-img]: https://img.shields.io/david/coderhaoxin/native-promisify.svg?style=flat-square
[david-url]: https://david-dm.org/coderhaoxin/native-promisify
