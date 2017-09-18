# mkdirp-promise [![version][npm-version]][npm-url] [![License][npm-license]][license-url]

[Promise] version of [mkdirp]:

> Like mkdir -p, but in node.js!

[![Build Status][travis-image]][travis-url]
[![Downloads][npm-downloads]][npm-url]
[![Code Climate][codeclimate-quality]][codeclimate-url]
[![Coverage Status][codeclimate-coverage]][codeclimate-url]
[![Dependencies][david-image]][david-url]

## Install

```sh
npm install --save mkdirp-promise
```

## API

```js
var mkdirp = require('mkdirp-promise')
```

### mkdirp(dir, [, options])

*pattern*: `String`  
*options*: `Object` or `String`  
Return: `Object` ([Promise])

When it finishes, it will be [*fulfilled*](http://promisesaplus.com/#point-26) with the first directory made that had to be created, if any.

When it fails, it will be [*rejected*](http://promisesaplus.com/#point-30) with an error as its first argument.

```js
mkdirp('/tmp/foo/bar/baz')
  .then(function (made) {
    console.log(made) //=> '/tmp/foo'
  })

  .catch(function (err) {
    console.error(err)
  })
})
```

#### options

The option object will be directly passed to [mkdirp](https://github.com/substack/node-mkdirp#mkdirpdir-opts-cb).

## License

[ISC License](LICENSE) &copy; [Ahmad Nassri](https://www.ahmadnassri.com/)

[license-url]: https://github.com/ahmadnassri/mkdirp-promise/blob/master/LICENSE

[travis-url]: https://travis-ci.org/ahmadnassri/mkdirp-promise
[travis-image]: https://img.shields.io/travis/ahmadnassri/mkdirp-promise.svg?style=flat-square

[npm-url]: https://www.npmjs.com/package/mkdirp-promise
[npm-license]: https://img.shields.io/npm/l/mkdirp-promise.svg?style=flat-square
[npm-version]: https://img.shields.io/npm/v/mkdirp-promise.svg?style=flat-square
[npm-downloads]: https://img.shields.io/npm/dm/mkdirp-promise.svg?style=flat-square

[codeclimate-url]: https://codeclimate.com/github/ahmadnassri/mkdirp-promise
[codeclimate-quality]: https://img.shields.io/codeclimate/github/ahmadnassri/mkdirp-promise.svg?style=flat-square
[codeclimate-coverage]: https://img.shields.io/codeclimate/coverage/github/ahmadnassri/mkdirp-promise.svg?style=flat-square

[david-url]: https://david-dm.org/ahmadnassri/mkdirp-promise
[david-image]: https://img.shields.io/david/ahmadnassri/mkdirp-promise.svg?style=flat-square

[mkdirp]: https://github.com/substack/node-mkdirp
[Promise]: http://promisesaplus.com/
