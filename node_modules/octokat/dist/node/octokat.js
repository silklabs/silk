(function() {
  var Chainer, OBJECT_MATCHER, Octokat, Replacer, Request, TREE_OPTIONS, injectVerbMethods, parse, plus, reChainChildren, ref, toPromise;

  plus = require('./plus');

  ref = require('./grammar'), TREE_OPTIONS = ref.TREE_OPTIONS, OBJECT_MATCHER = ref.OBJECT_MATCHER;

  Chainer = require('./chainer');

  injectVerbMethods = require('./verb-methods');

  Replacer = require('./replacer');

  Request = require('./request');

  toPromise = require('./helper-promise').toPromise;

  reChainChildren = function(request, url, obj) {
    var context, i, k, key, len, re, ref1;
    for (key in OBJECT_MATCHER) {
      re = OBJECT_MATCHER[key];
      if (re.test(obj.url)) {
        context = TREE_OPTIONS;
        ref1 = key.split('.');
        for (i = 0, len = ref1.length; i < len; i++) {
          k = ref1[i];
          context = context[k];
        }
        Chainer(request, url, k, context, obj);
      }
    }
    return obj;
  };

  parse = function(obj, path, request) {
    var replacer, url;
    url = obj.url || path;
    if (url) {
      replacer = new Replacer(request);
      obj = replacer.replace(obj);
      Chainer(request, url, true, {}, obj);
      reChainChildren(request, url, obj);
    } else {
      Chainer(request, '', null, TREE_OPTIONS, obj);
    }
    return obj;
  };

  Octokat = function(clientOptions) {
    var disableHypermedia, obj, request;
    if (clientOptions == null) {
      clientOptions = {};
    }
    disableHypermedia = clientOptions.disableHypermedia;
    if (disableHypermedia == null) {
      disableHypermedia = false;
    }
    request = function(method, path, data, options, cb) {
      var _request, ref1, replacer;
      if (options == null) {
        options = {
          raw: false,
          isBase64: false,
          isBoolean: false
        };
      }
      replacer = new Replacer(request);
      if (data && !(typeof global !== "undefined" && global !== null ? (ref1 = global['Buffer']) != null ? ref1.isBuffer(data) : void 0 : void 0)) {
        data = replacer.uncamelize(data);
      }
      _request = Request(clientOptions);
      return _request(method, path, data, options, function(err, val) {
        var obj;
        if (err) {
          return cb(err);
        }
        if (options.raw) {
          return cb(null, val);
        }
        if (!disableHypermedia) {
          obj = parse(val, path, request);
          return cb(null, obj);
        } else {
          return cb(null, val);
        }
      });
    };
    obj = {};
    Chainer(request, '', null, TREE_OPTIONS, obj);
    obj.me = obj.user;
    obj.parse = function(jsonObj) {
      return parse(jsonObj, '', request);
    };
    obj.fromUrl = function(path) {
      var ret;
      ret = {};
      injectVerbMethods(request, path, ret);
      return ret;
    };
    obj.status = toPromise(function(cb) {
      return request('GET', 'https://status.github.com/api/status.json', null, null, cb);
    });
    obj.status.api = toPromise(function(cb) {
      return request('GET', 'https://status.github.com/api.json', null, null, cb);
    });
    obj.status.lastMessage = toPromise(function(cb) {
      return request('GET', 'https://status.github.com/api/last-message.json', null, null, cb);
    });
    obj.status.messages = toPromise(function(cb) {
      return request('GET', 'https://status.github.com/api/messages.json', null, null, cb);
    });
    return obj;
  };

  module.exports = Octokat;

}).call(this);
