'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _last2 = require('lodash/last');

var _last3 = _interopRequireDefault(_last2);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = function (pattern) {
    var filename = pattern.to || '';

    return pattern.toType !== 'file' && (_path2.default.extname(filename) === '' || (0, _last3.default)(filename) === _path2.default.sep || (0, _last3.default)(filename) === '/' || pattern.toType === 'dir');
};

module.exports = exports['default'];
//# sourceMappingURL=toLooksLikeDirectory.js.map
