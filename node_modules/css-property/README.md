# css-property [![Build Status](https://travis-ci.org/jonkemp/css-property.svg?branch=master)](https://travis-ci.org/jonkemp/css-property) [![Coverage Status](https://coveralls.io/repos/jonkemp/css-property/badge.svg?branch=master&service=github)](https://coveralls.io/github/jonkemp/css-property?branch=master)

[![NPM](https://nodei.co/npm/css-property.png?downloads=true)](https://nodei.co/npm/css-property/)

> CSS property constructor

## Install

Install with [npm](https://npmjs.org/package/css-property)

```
npm install --save css-property
```

## Usage

```js
var Selector = require('style-selector'),
    Property = require('css-property'),
    bodySelector = new Selector('body'),
    prop = new Property('font-family', 'Arial', bodySelector);

console.log(prop.prop);             // font-family
console.log(prop.value);            // Arial
console.log(prop.selector.text);    // body
console.log(prop.toString());       // font-family: Arial;
```

## API

### Property(prop, value, selector)

#### prop

Type: `String`  
Default: `none`

Property

#### value

Type: `String`  
Default: `none`

Value

#### selector

Type: `Object`  
Default: `none`

Selector the property originates from.

### Property.prototype.compare(property)

Compares with another Property based on Selector#specificity.

#### property

Type: `Object`  
Default: `none`

Property to compare.

#### Property.prototype.toString()

Returns CSS property.

## Credit

The code for this module was originally taken from the [Juice](https://github.com/Automattic/juice) library.

## License

MIT
