/*eslint-disable */

'use strict';

var assert = require('assert'),
    Selector = require('style-selector'),
    Property = require('./');

describe('Property', function () {
    it('should return an object', function () {
        var bodySelector = new Selector('body'),
            prop = new Property('font-family', 'Arial', bodySelector);
        assert(prop);
        assert.equal(prop.prop, 'font-family');
        assert.equal(prop.value, 'Arial');
        assert(prop.selector);
        assert.equal(prop.selector.text, 'body');
    });
});

describe('Property.toString', function () {
    it('should return a css declaration', function () {
        var bodySelector = new Selector('body'),
            prop = new Property('font-family', 'Arial', bodySelector);
        assert.equal(prop.toString(), 'font-family: Arial;');
    });
});

describe('Property.compare', function () {
    it('should return the more specific of two properties', function () {
        var bodySelector = new Selector('body'),
            h1Selector = new Selector('h1'),
            propA = new Property('font-family', 'Arial', bodySelector),
            propB = new Property('color', 'blue', h1Selector),
            winner = propA.compare(propB);
        assert.equal(winner.selector.text, 'h1');
    });
});
