(function() {
  var Promise, allPromises, injector, newPromise, ref, req, toPromise,
    slice = [].slice;

  if (typeof window !== "undefined" && window !== null) {
    if (window.Q) {
      newPromise = (function(_this) {
        return function(fn) {
          var deferred, reject, resolve;
          deferred = window.Q.defer();
          resolve = function(val) {
            return deferred.resolve(val);
          };
          reject = function(err) {
            return deferred.reject(err);
          };
          fn(resolve, reject);
          return deferred.promise;
        };
      })(this);
      allPromises = function(promises) {
        return window.Q.all(promises);
      };
    } else if (window.angular) {
      newPromise = null;
      allPromises = null;
      injector = angular.injector(['ng']);
      injector.invoke(function($q) {
        newPromise = function(fn) {
          var deferred, reject, resolve;
          deferred = $q.defer();
          resolve = function(val) {
            return deferred.resolve(val);
          };
          reject = function(err) {
            return deferred.reject(err);
          };
          fn(resolve, reject);
          return deferred.promise;
        };
        return allPromises = function(promises) {
          return $q.all(promises);
        };
      });
    } else if ((ref = window.jQuery) != null ? ref.Deferred : void 0) {
      newPromise = (function(_this) {
        return function(fn) {
          var promise, reject, resolve;
          promise = window.jQuery.Deferred();
          resolve = function(val) {
            return promise.resolve(val);
          };
          reject = function(val) {
            return promise.reject(val);
          };
          fn(resolve, reject);
          return promise.promise();
        };
      })(this);
      allPromises = (function(_this) {
        return function(promises) {
          var ref1;
          return (ref1 = window.jQuery).when.apply(ref1, promises).then(function() {
            var promises;
            promises = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            return promises;
          });
        };
      })(this);
    } else if (window.Promise) {
      newPromise = (function(_this) {
        return function(fn) {
          return new window.Promise(function(resolve, reject) {
            if (resolve.fulfill) {
              return fn(resolve.resolve.bind(resolve), resolve.reject.bind(resolve));
            } else {
              return fn.apply(null, arguments);
            }
          });
        };
      })(this);
      allPromises = (function(_this) {
        return function(promises) {
          return window.Promise.all(promises);
        };
      })(this);
    } else {
      if (typeof console !== "undefined" && console !== null) {
        if (typeof console.warn === "function") {
          console.warn('Octokat: A Promise API was not found. Supported libraries that have Promises are jQuery, angularjs, and es6-promise');
        }
      }
    }
  } else {
    req = require;
    Promise = this.Promise || req('es6-promise').Promise;
    newPromise = function(fn) {
      return new Promise(fn);
    };
    allPromises = function(promises) {
      return Promise.all(promises);
    };
  }

  toPromise = function(orig) {
    return function() {
      var args, last;
      args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      last = args[args.length - 1];
      if (typeof last === 'function') {
        args.pop();
        return orig.apply(null, [last].concat(slice.call(args)));
      } else if (newPromise) {
        return newPromise(function(resolve, reject) {
          var cb;
          cb = function(err, val) {
            if (err) {
              return reject(err);
            }
            return resolve(val);
          };
          return orig.apply(null, [cb].concat(slice.call(args)));
        });
      } else {
        throw new Error('You must specify a callback or have a promise library loaded');
      }
    };
  };

  module.exports = {
    newPromise: newPromise,
    allPromises: allPromises,
    toPromise: toPromise
  };

}).call(this);
