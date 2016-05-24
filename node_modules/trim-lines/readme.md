# trim-lines [![Build Status](https://img.shields.io/travis/wooorm/trim-lines.svg?style=flat)](https://travis-ci.org/wooorm/trim-lines) [![Coverage Status](https://img.shields.io/coveralls/wooorm/trim-lines.svg?style=flat)](https://coveralls.io/r/wooorm/trim-lines?branch=master)

Remove spaces and tabs around line-breaks.

## Installation

[npm](https://docs.npmjs.com/cli/install):

```bash
npm install trim-lines
```

**trim-lines** is also available for [bower](http://bower.io/#install-packages),
[component](https://github.com/componentjs/component), [duo](http://duojs.org/#getting-started),
and for AMD, CommonJS, and globals ([uncompressed](trim-lines.js) and
[compressed](trim-lines.min.js)).

## Usage

Dependencies.

```javascript
var trimLines = require('trim-lines');
```

Trim line-breaks:

```javascript
var result = trimLines(' foo\t\n\n bar \n\tbaz ');
```

Yields:

```text
 foo
bar
baz 
```

## API

### trimLines(value)

Remove initial and final spaces and tabs at the line breaks in `value`.  Does
not trim initial and final spaces and tabs of the value itself.

Parameters:

*   `value` (`string`) — Value with untrimmed line breaks, coerced to string.

Returns: `string` — Value with trimmed line breaks.

## License

[MIT](LICENSE) @ [Titus Wormer](http://wooorm.com)
