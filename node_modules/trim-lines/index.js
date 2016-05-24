'use strict';

/*
 * Constants.
 */

var WHITE_SPACE_COLLAPSABLE_LINE = /[ \t]*\n+[ \t]*/g;
var LINE = '\n';

/**
 * Remove initial and final spaces and tabs at the
 * line breaks in `value`. Does not trim initial and
 * final spaces and tabs of the value itself.
 *
 * @example
 *   trimLines(' foo\t\n\n bar \n\tbaz '); // ' foo\nbar\nbaz '
 *
 * @param {string} value - Value with untrimmed line breaks,
 *   coerced to string.
 * @return {string} - Value with trimmed line breaks.
 */
function trimLines(value) {
    return String(value).replace(WHITE_SPACE_COLLAPSABLE_LINE, LINE);
}

/*
 * Expose.
 */

module.exports = trimLines;
