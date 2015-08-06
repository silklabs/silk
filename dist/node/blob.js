'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

var getPutUrl = _asyncToGenerator(function* (baseUrl, blobType, contentLength, contentType) {
  blobType = blobType.toLowerCase();
  contentType = contentType.toLowerCase();

  var postUrl = _url2['default'].resolve(baseUrl, 'blob/' + blobType);
  var request = {
    method: 'POST',
    headers: {
      'Content-Length': contentLength,
      'Content-Type': contentType
    }
  };

  var response = yield (0, _fetch2['default'])(postUrl, request);
  if (!response.ok) {
    yield (0, _fetch_error2['default'])(response);
  }

  return response.headers.get('Location');
});

var put = _asyncToGenerator(function* (putUrl, contentLength, contentType, bufferOrStream) {
  contentType = contentType.toLowerCase();

  var stream = undefined;
  if (bufferOrStream instanceof Buffer) {
    stream = new BufferToStream(bufferOrStream);
  } else {
    stream = bufferOrStream;
  }

  var request = {
    method: 'PUT',
    headers: {
      'Content-Length': contentLength,
      'Content-Type': contentType
    },
    body: stream
  };

  var response = yield (0, _fetch2['default'])(putUrl, request);
  if (!response.ok) {
    yield (0, _fetch_error2['default'])(response);
  }
});

var ack = _asyncToGenerator(function* (postUrl, putUrl) {
  var body = JSON.stringify({ url: putUrl });
  var request = {
    method: 'POST',
    headers: {
      'Content-Length': body.length,
      'Content-Type': 'application/json'
    },
    body: body
  };

  var response = yield (0, _fetch2['default'])(postUrl, request);
  if (!response.ok) {
    yield (0, _fetch_error2['default'])(response);
  }

  return response.headers.get('Location');
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { var callNext = step.bind(null, 'next'); var callThrow = step.bind(null, 'throw'); function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(callNext, callThrow); } } callNext(); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _fetch = require('./fetch');

var _fetch2 = _interopRequireDefault(_fetch);

var _stream = require('stream');

var _fetch_error = require('./fetch_error');

var _fetch_error2 = _interopRequireDefault(_fetch_error);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var BufferToStream = (function (_Readable) {
  _inherits(BufferToStream, _Readable);

  function BufferToStream(buffer) {
    _classCallCheck(this, BufferToStream);

    _get(Object.getPrototypeOf(BufferToStream.prototype), 'constructor', this).call(this);
    this.buffer = buffer;
  }

  _createClass(BufferToStream, [{
    key: '_read',
    value: function _read() {
      this.push(this.buffer);
      // next time _read is called this will be returned triggering the end of
      // the stream...
      this.buffer = null;
    }
  }]);

  return BufferToStream;
})(_stream.Readable);

exports['default'] = function (config) {
  var baseUrl = config.serverUrl;
  return {
    getPutUrl: getPutUrl.bind(null, baseUrl),
    put: put,
    ack: ack.bind(null, _url2['default'].resolve(baseUrl, 'blob/ack')),

    upload: _asyncToGenerator(function* (blobType, contentLength, contentType, bufferOrStream) {
      var putUrl = yield this.getPutUrl(blobType, contentLength, contentType);
      yield this.put(putUrl, contentLength, contentType, bufferOrStream);
      return yield this.ack(putUrl);
    })
  };
};

module.exports = exports['default'];