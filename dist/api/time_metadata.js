'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _fetch_json = require('./fetch_json');

var _fetch_json2 = _interopRequireDefault(_fetch_json);

exports['default'] = function (config) {
  var baseUrl = config.server_url; //eslint-disable-line
  return {
    create: _fetch_json2['default'].bind(null, baseUrl + '/device/metadata/'),
    findById: _fetch_json2['default'].bind(null, baseUrl + '/device/metadata/find/byid'),
    findByTime: _fetch_json2['default'].bind(null, baseUrl + '/device/metadata/find/bytime')
  };
};

module.exports = exports['default'];