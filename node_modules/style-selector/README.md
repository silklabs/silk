# style-selector [![Build Status](https://travis-ci.org/jonkemp/style-selector.svg?branch=master)](https://travis-ci.org/jonkemp/style-selector) [![Coverage Status](https://coveralls.io/repos/jonkemp/style-selector/badge.svg?branch=master&service=github)](https://coveralls.io/github/jonkemp/style-selector?branch=master)

[![NPM](https://nodei.co/npm/style-selector.png?downloads=true)](https://nodei.co/npm/style-selector/)

> CSS selector constructor

Uses [Slick](https://github.com/subtleGradient/slick) to parse and tokenize the CSS selectors.

## Install

Install with [npm](https://npmjs.org/package/style-selector)

```
npm install --save style-selector
```

## Usage

```js
var Selector = require('style-selector'),
    bodySelector = new Selector('body', [ 0, 0, 0, 1 ]);

console.log(selector);                  // { text: 'body', spec: [ 0, 0, 0, 1 ] }
console.log(selector.parsed());         // { '0': { combinator: ' ', tag: 'body' }, length: 1 }
console.log(selector.specificity());    // [ 0, 0, 0, 1 ]
```

## API

### Selector(text, spec)

CSS selector constructor

#### text

Type: `String`  
Default: `none`

Selector text

#### spec

Type: `Array`  
Default: `none`

Optional, precalculated specificity

### Selector.prototype.parsed()

Get parsed selector

### Selector.prototype.specificity()

Lazy specificity getter

## Credit

The code for this module was originally taken from the [Juice](https://github.com/Automattic/juice) library.

## License

MIT
