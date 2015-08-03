'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _fetch_json = require('./fetch_json');

var _fetch_json2 = _interopRequireDefault(_fetch_json);

var _url = require('url');

exports['default'] = function (config) {
  var baseUrl = config.serverUrl; //eslint-disable-line
  return {
    create: _fetch_json2['default'].bind(null, (0, _url.resolve)(baseUrl, '/device/metadata/')),
    findById: _fetch_json2['default'].bind(null, (0, _url.resolve)(baseUrl, '/device/metadata/find/byid')),
    findByTime: _fetch_json2['default'].bind(null, (0, _url.resolve)(baseUrl, '/device/metadata/find/bytime'))
  };
};

module.exports = exports['default'];