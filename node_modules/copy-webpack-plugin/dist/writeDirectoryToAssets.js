'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _head2 = require('lodash/head');

var _head3 = _interopRequireDefault(_head2);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _shouldIgnore = require('./shouldIgnore');

var _shouldIgnore2 = _interopRequireDefault(_shouldIgnore);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _writeFileToAssets = require('./writeFileToAssets');

var _writeFileToAssets2 = _interopRequireDefault(_writeFileToAssets);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable import/no-commonjs */
var dir = _bluebird2.default.promisifyAll(require('node-dir'));
/* eslint-enable */

exports.default = function (opts) {
    var compilation = opts.compilation;
    var absDirSrc = opts.absDirSrc;
    var relDirDest = opts.relDirDest;
    var flatten = opts.flatten;
    var forceWrite = opts.forceWrite;
    var ignoreList = opts.ignoreList;
    var copyUnmodified = opts.copyUnmodified;
    var lastGlobalUpdate = opts.lastGlobalUpdate;

    return dir.filesAsync(absDirSrc).map(function (absFileSrc) {
        var relFileDest = void 0;

        var relFileSrc = _path2.default.relative(absDirSrc, absFileSrc);

        relFileDest = _path2.default.join(relDirDest, relFileSrc);

        // Remove any directory reference if flattening
        if (flatten) {
            relFileDest = _path2.default.join(relDirDest, _path2.default.basename(relFileDest));
        }

        // Skip if it matches any of our ignore list
        if ((0, _shouldIgnore2.default)(relFileSrc, ignoreList)) {
            return false;
        }

        // Make sure it doesn't start with the separator
        if ((0, _head3.default)(relFileDest) === _path2.default.sep) {
            relFileDest = relFileDest.slice(1);
        }

        return (0, _writeFileToAssets2.default)({
            absFileSrc: absFileSrc,
            compilation: compilation,
            copyUnmodified: copyUnmodified,
            forceWrite: forceWrite,
            lastGlobalUpdate: lastGlobalUpdate,
            relFileDest: relFileDest
        });
    });
};

module.exports = exports['default'];
//# sourceMappingURL=writeDirectoryToAssets.js.map
