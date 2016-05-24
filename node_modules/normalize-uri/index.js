'use strict';

/**
 * Normalize `uri`. This only works when both `encodeURI`
 * and `decodeURI` are available, and when
 * decoding/encoding fails, just returns `uri`.
 *
 * @example
 *   normalizeURI('foo bar'); // 'foo%20bar'
 *   normalizeURI('foo%20bar'); // 'foo%20bar'
 *
 * @param {string} uri - Value with and/or without
 *   encoded, entities.
 * @return {string} - Encoded URI (when encoding succeeds,
 * or `uri`).
 */
function normalizeURI(uri) {
    try {
        uri = encodeURI(decodeURI(uri));
    } catch (exception) { /* empty */ }

    return uri;
}

/*
 * Expose.
 */

module.exports = normalizeURI;
