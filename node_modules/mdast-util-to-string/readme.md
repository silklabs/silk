# mdast-util-to-string [![Build Status][travis-badge]][travis] [![Coverage Status][coverage-badge]][coverage]

[**remark**][remark] utility to get the plain text
content of an [**mdast**][mdast] node.

## Installation

[npm][npm-install]:

```bash
npm install mdast-util-to-string
```

**mdast-util-to-string** is also available for [duo][],
and as an AMD, CommonJS, and globals module,
[uncompressed and compressed][releases].

## Usage

```js
/*
 * Dependencies.
 */

var remark = require('remark');
var toString = require('mdast-util-to-string');

/*
 * AST.
 */

var ast = remark.parse('Some *emphasis*, **strongness**, and `code`.');

toString(ast);
// 'Some emphasis, strongness, and code.'
```

## API

### `toString(node)`

Get the text content of a node.

The algorithm checks `value` of `node`, then `alt`, and finally `title`.
If no value is found, the algorithm checks the children of `node` and
joins them (without spaces or newlines).

> This is not a markdown to plain-text library.
> Use [strip-markdown](https://github.com/wooorm/strip-markdown) for that.

**Parameters**:

*   `node` ([`Node`][mdast-node]).

**Returns**: `string` — text representation of `node`.

## License

[MIT][license] © [Titus Wormer][home]

<!-- Definitions -->

[travis-badge]: https://img.shields.io/travis/wooorm/mdast-util-to-string.svg

[travis]: https://travis-ci.org/wooorm/mdast-util-to-string

[coverage-badge]: https://img.shields.io/codecov/c/github/wooorm/mdast-util-to-string.svg

[coverage]: https://codecov.io/github/wooorm/mdast-util-to-string

[remark]: https://github.com/wooorm/remark

[mdast]: https://github.com/wooorm/mdast

[mdast-node]: https://github.com/wooorm/mdast#node

[npm-install]: https://docs.npmjs.com/cli/install

[duo]: http://duojs.org/#getting-started

[releases]: https://github.com/wooorm/mdast-util-to-string/releases

[license]: LICENSE

[home]: http://wooorm.com
