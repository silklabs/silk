'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _omit2 = require('lodash/omit');

var _omit3 = _interopRequireDefault(_omit2);

var _assign2 = require('lodash/assign');

var _assign3 = _interopRequireDefault(_assign2);

var _isObject2 = require('lodash/isObject');

var _isObject3 = _interopRequireDefault(_isObject2);

var _isString2 = require('lodash/isString');

var _isString3 = _interopRequireDefault(_isString2);

var _find2 = require('lodash/find');

var _find3 = _interopRequireDefault(_find2);

var _minimatch = require('minimatch');

var _minimatch2 = _interopRequireDefault(_minimatch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = function (pathName, ignoreList) {
    var matched = (0, _find3.default)(ignoreList, function (gb) {
        var glob = void 0,
            params = void 0;

        // Default minimatch params
        params = {
            matchBase: true
        };

        if ((0, _isString3.default)(gb)) {
            glob = gb;
        } else if ((0, _isObject3.default)(gb)) {
            glob = gb.glob || '';
            // Overwrite minimatch defaults
            params = (0, _assign3.default)(params, (0, _omit3.default)(gb, ['glob']));
        } else {
            glob = '';
        }

        return (0, _minimatch2.default)(pathName, glob, params);
    });

    return Boolean(matched);
};

module.exports = exports['default'];
//# sourceMappingURL=shouldIgnore.js.map
