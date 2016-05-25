(function() {
  var URL_TESTER, URL_VALIDATOR, injectVerbMethods, toPromise, toQueryString,
    slice = [].slice;

  URL_VALIDATOR = require('./grammar').URL_VALIDATOR;

  toPromise = require('./helper-promise').toPromise;

  toQueryString = require('./helper-querystring');

  URL_TESTER = function(path) {
    var err;
    if (!URL_VALIDATOR.test(path)) {
      err = "BUG: Invalid Path. If this is actually a valid path then please update the URL_VALIDATOR. path=" + path;
      return console.warn(err);
    }
  };

  injectVerbMethods = function(request, path, obj) {
    var results, verbFunc, verbName, verbs;
    verbs = {
      fetch: function(cb, config) {
        return request('GET', "" + path + (toQueryString(config)), null, {}, cb);
      },
      read: function(cb, config) {
        return request('GET', "" + path + (toQueryString(config)), null, {
          raw: true
        }, cb);
      },
      readBinary: function(cb, config) {
        return request('GET', "" + path + (toQueryString(config)), null, {
          raw: true,
          isBase64: true
        }, cb);
      },
      remove: function(cb, config) {
        return request('DELETE', path, config, {
          isBoolean: true
        }, cb);
      },
      create: function(cb, config, isRaw) {
        return request('POST', path, config, {
          raw: isRaw
        }, cb);
      },
      update: function(cb, config) {
        return request('PATCH', path, config, null, cb);
      },
      add: function(cb, config) {
        return request('PUT', path, config, {
          isBoolean: true
        }, cb);
      },
      contains: function() {
        var args, cb;
        cb = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
        return request('GET', path + "/" + (args.join('/')), null, {
          isBoolean: true
        }, cb);
      }
    };
    results = [];
    for (verbName in verbs) {
      verbFunc = verbs[verbName];
      results.push((function(verbName, verbFunc) {
        return obj[verbName] = function() {
          var args;
          args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
          URL_TESTER(path);
          return toPromise(verbFunc).apply(null, args);
        };
      })(verbName, verbFunc));
    }
    return results;
  };

  module.exports = injectVerbMethods;

}).call(this);
