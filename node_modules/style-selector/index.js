'use strict';

/**
 * Module dependencies.
 */

var parser = require('slick').parse;

/**
* Parses a selector and returns the tokens.
*
* @param {String} selector
* @api private.
*/

function parse(text) {
    try {
        return parser(text)[0];
    } catch (e) {
        return [];
    }
}

/**
 * CSS selector constructor.
 *
 * @param {String} selector text
 * @param {Array} optionally, precalculated specificity
 * @api public
 */

function Selector(text, spec) {
    this.text = text;
    this.spec = spec;
}

/**
 * Get parsed selector.
 *
 * @api public
 */

Selector.prototype.parsed = function () {
    if (!this.tokens) {
        this.tokens = parse(this.text);
    }
    return this.tokens;
};

/**
 * Lazy specificity getter
 *
 * @api public
 */

Selector.prototype.specificity = function () {

    function specificity(text, parsed) {
        var expressions = parsed || parse(text),
            spec = [ 0, 0, 0, 0 ],
            nots = [],
            i,
            expression,
            pseudos,
            p,
            ii,
            not,
            jj;

        for (i = 0; i < expressions.length; i++) {
            expression = expressions[i];
            pseudos = expression.pseudos;

            // id awards a point in the second column
            if (expression.id) {
                spec[1]++;
            }

            // classes and attributes award a point each in the third column
            if (expression.attributes) {
                spec[2] += expression.attributes.length;
            }
            if (expression.classList) {
                spec[2] += expression.classList.length;
            }

            // tag awards a point in the fourth column
            if (expression.tag && expression.tag !== '*') {
                spec[3]++;
            }

            // pseudos award a point each in the fourth column
            if (pseudos) {
                spec[3] += pseudos.length;

                for (p = 0; p < pseudos.length; p++) {
                    if (pseudos[p].key === 'not') {
                        nots.push(pseudos[p].value);
                        spec[3]--;
                    }
                }
            }
        }

        for (ii = nots.length; ii--;) {
            not = specificity(nots[ii]);
            for (jj = 4; jj--;) {
                spec[jj] += not[jj];
            }
        }

        return spec;
    }

    if (!this.spec) {
        this.spec = specificity(this.text, this.parsed());
    }
    return this.spec;
};

/**
* Module exports.
*/

module.exports = exports = Selector;
