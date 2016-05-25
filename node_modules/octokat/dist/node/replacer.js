(function() {
  var Chainer, OBJECT_MATCHER, Replacer, TREE_OPTIONS, plus, ref, toPromise, toQueryString,
    slice = [].slice;

  plus = require('./plus');

  toPromise = require('./helper-promise').toPromise;

  toQueryString = require('./helper-querystring');

  ref = require('./grammar'), TREE_OPTIONS = ref.TREE_OPTIONS, OBJECT_MATCHER = ref.OBJECT_MATCHER;

  Chainer = require('./chainer');

  Replacer = (function() {
    function Replacer(_request) {
      this._request = _request;
    }

    Replacer.prototype.uncamelize = function(obj) {
      var i, j, key, len, o, ref1, value;
      if (Array.isArray(obj)) {
        return (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = obj.length; j < len; j++) {
            i = obj[j];
            results.push(this.uncamelize(i));
          }
          return results;
        }).call(this);
      } else if (obj === Object(obj)) {
        o = {};
        ref1 = Object.keys(obj);
        for (j = 0, len = ref1.length; j < len; j++) {
          key = ref1[j];
          value = obj[key];
          o[plus.uncamelize(key)] = this.uncamelize(value);
        }
        return o;
      } else {
        return obj;
      }
    };

    Replacer.prototype.replace = function(o) {
      if (Array.isArray(o)) {
        return this._replaceArray(o);
      } else if (o === Object(o)) {
        return this._replaceObject(o);
      } else {
        return o;
      }
    };

    Replacer.prototype._replaceObject = function(orig) {
      var acc, context, j, k, key, l, len, len1, len2, n, re, ref1, ref2, ref3, url, value;
      acc = {};
      ref1 = Object.keys(orig);
      for (j = 0, len = ref1.length; j < len; j++) {
        key = ref1[j];
        value = orig[key];
        this._replaceKeyValue(acc, key, value);
      }
      url = acc.url;
      if (url) {
        Chainer(this._request, url, true, null, acc);
      }
      ref2 = Object.keys(OBJECT_MATCHER);
      for (l = 0, len1 = ref2.length; l < len1; l++) {
        key = ref2[l];
        re = OBJECT_MATCHER[key];
        if (re.test(url)) {
          context = TREE_OPTIONS;
          ref3 = key.split('.');
          for (n = 0, len2 = ref3.length; n < len2; n++) {
            k = ref3[n];
            context = context[k];
          }
          Chainer(this._request, url, k, context, acc);
        }
      }
      return acc;
    };

    Replacer.prototype._replaceArray = function(orig) {
      var arr, item, j, key, len, ref1, value;
      arr = (function() {
        var j, len, results;
        results = [];
        for (j = 0, len = orig.length; j < len; j++) {
          item = orig[j];
          results.push(this.replace(item));
        }
        return results;
      }).call(this);
      ref1 = Object.keys(orig);
      for (j = 0, len = ref1.length; j < len; j++) {
        key = ref1[j];
        value = orig[key];
        this._replaceKeyValue(arr, key, value);
      }
      return arr;
    };

    Replacer.prototype._replaceKeyValue = function(acc, key, value) {
      var fn, newKey;
      if (/_url$/.test(key)) {
        fn = (function(_this) {
          return function() {
            var args, cb, contentType, data, i, j, len, m, match, optionalNames, param, paramName, ref1, ref2, url;
            cb = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
            if (!(/\{/.test(value) || /_page_url$/.test(key))) {
              console.warn('Deprecation warning: Use the .fooUrl field instead of calling the method');
            }
            url = value;
            i = 0;
            while (m = /(\{[^\}]+\})/.exec(url)) {
              match = m[1];
              if (i < args.length) {
                param = args[i];
                switch (match[1]) {
                  case '/':
                    param = "/" + param;
                    break;
                  case '?':
                    optionalNames = match.slice(2, -1).split(',');
                    if (typeof param === 'object') {
                      if (Object.keys(param).length === 0) {
                        console.warn('Must pass in a dictionary with at least one key when there are multiple optional params');
                      }
                      ref1 = Object.keys(param);
                      for (j = 0, len = ref1.length; j < len; j++) {
                        paramName = ref1[j];
                        if (optionalNames.indexOf(paramName) < 0) {
                          console.warn("Invalid parameter '" + paramName + "' passed in as argument");
                        }
                      }
                      param = toQueryString(param);
                    } else {
                      param = "?" + optionalNames[0] + "=" + param;
                    }
                }
              } else {
                param = '';
                if (match[1] !== '/') {
                  throw new Error("BUG: Missing required parameter " + match);
                }
              }
              url = url.replace(match, param);
              i++;
            }
            if (/upload_url$/.test(key)) {
              ref2 = args.slice(-2), contentType = ref2[0], data = ref2[1];
              return _this._request('POST', url, data, {
                contentType: contentType,
                raw: true
              }, cb);
            } else {
              return _this._request('GET', url, null, null, cb);
            }
          };
        })(this);
        fn = toPromise(fn);
        fn.url = value;
        newKey = key.substring(0, key.length - '_url'.length);
        acc[plus.camelize(newKey)] = fn;
        if (!/\{/.test(value)) {
          return acc[plus.camelize(key)] = value;
        }
      } else if (/_at$/.test(key)) {
        return acc[plus.camelize(key)] = value ? new Date(value) : null;
      } else {
        return acc[plus.camelize(key)] = this.replace(value);
      }
    };

    return Replacer;

  })();

  module.exports = Replacer;

}).call(this);
