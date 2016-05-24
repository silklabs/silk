# is-public-domain [![Build Status](https://travis-ci.org/sindresorhus/is-public-domain.svg?branch=master)](https://travis-ci.org/sindresorhus/is-public-domain)

> Check if a domain is public


## Install

```
$ npm install --save is-public-domain
```


## Usage

```js
var isPublicDomain = require('is-public-domain');

isPublicDomain('sindresorhus.com');
//=> true

isPublicDomain('unicorn.ninja');
//=> true

isPublicDomain('intranet.local');
//=> false
```


## License

MIT © [Sindre Sorhus](http://sindresorhus.com)
