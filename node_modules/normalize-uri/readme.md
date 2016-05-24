# normalize-uri [![Build Status](https://img.shields.io/travis/wooorm/normalize-uri.svg?style=flat)](https://travis-ci.org/wooorm/normalize-uri) [![Coverage Status](https://img.shields.io/coveralls/wooorm/normalize-uri.svg?style=flat)](https://coveralls.io/r/wooorm/normalize-uri?branch=master)

Remove spaces and tabs around line-breaks.

## Installation

[npm](https://docs.npmjs.com/cli/install):

```bash
npm install normalize-uri
```

**normalize-uri** is also available for [bower](http://bower.io/#install-packages),
[component](https://github.com/componentjs/component), [duo](http://duojs.org/#getting-started),
and for AMD, CommonJS, and globals ([uncompressed](normalize-uri.js) and
[compressed](normalize-uri.min.js)).

## Usage

Dependencies.

```javascript
var normalizeURI = require('normalize-uri');
```

Normalize:

```javascript
var a = normalizeURI('foo bar');
var b = normalizeURI('foo%20bar');
var c = normalizeURI('👌');
```

Yields:

```text
foo%20bar
```

```text
foo%20bar
```

```text
%F0%9F%91%8C
```

## API

### normalizeURI(value)

Normalize `uri`. This only works when both `encodeURI` and `decodeURI` are
available, and when decoding/encoding fails, just returns `uri`.

Parameters:

*   `uri` (`string`) — Value with and/or without encoded, entities.

Returns: `string` — Encoded URI (when encoding succeeds, or `uri`).

## License

[MIT](LICENSE) @ [Titus Wormer](http://wooorm.com)
