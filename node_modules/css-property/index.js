'use strict';

 /**
 * Compares two specificity vectors, returning the winning one.
 *
 * @param {Array} vector a
 * @param {Array} vector b
 * @return {Array}
 * @api public
 */

function compare(a, b) {
    var i;

    for (i = 0; i < 4; i++) {
        if (a[i] === b[i]) {
            continue;
        }
        if (a[i] > b[i]) {
            return a;
        }
        return b;
    }

    return b;
}

/**
 * CSS property constructor.
 *
 * @param {String} property
 * @param {String} value
 * @param {Selector} selector the property originates from
 * @api public
 */

function Property(prop, value, selector) {
    this.prop = prop;
    this.value = value;
    this.selector = selector;
}

/**
 * Compares with another Property based on Selector#specificity.
 *
 * @api public
 */

Property.prototype.compare = function (property) {
    var a = this.selector.specificity(),
        b = property.selector.specificity(),
        winner = compare(a, b);

    if (winner === a && a !== b) {
        return this;
    }
    return property;
};

/**
 * Returns CSS property
 *
 * @api public
 */

Property.prototype.toString = function () {
    return this.prop + ': ' + this.value.replace(/['"]+/g, '') + ';';
};

module.exports = exports = Property;
