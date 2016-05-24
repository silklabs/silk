/*
 * node-static-alias
 * https://github.com/anseki/node-static-alias
 *
 * Copyright (c) 2013 anseki
 * Licensed under the MIT license.
 */

'use strict';

var staticSuper = require('node-static'),
    fs     = require('fs'),
    events = require('events'),
    path   = require('path'),
    platform = process.platform;

function Server() {
  var that = this;
  staticSuper.Server.apply(that, arguments); // Super class constructor

  if (that.options.alias) { // To Array
    if (!Array.isArray(that.options.alias)) {
      that.options.alias = [that.options.alias];
    }
    that.options.alias.forEach(function(alias) {
      alias.match = !alias.match ? [] :
        !Array.isArray(alias.match) ? [alias.match] :
        alias.match;
      alias.serve = !alias.serve ? ['<% absPath %>'] :
        !Array.isArray(alias.serve) ? [alias.serve] :
        alias.serve;
    });
  }

  if (that.options.logger) {
    ['info', 'log'].some(function(methodName) {
      if (typeof that.options.logger[methodName] === 'function') {
        that._log = function() {
          that.options.logger[methodName].apply(that.options.logger, arguments);
        };
        return true;
      } else {
        return false;
      }
    });
  }
  that._log = that._log || function() {};
}

// util.inherits()
Server.prototype = Object.create(staticSuper.Server.prototype);
Server.prototype.constructor = Server;

Server.prototype.servePath = function(pathname, status, headers, req, res, finish) {
  var that = this,
      servePath = that.parsePath(pathname, req),
      promise = new(events.EventEmitter);

  if (servePath) {
    fs.stat(servePath, function(e, stat) {
      if (e) {
        finish(404, {});
      } else if (stat.isFile()) {      // Stream a single file.
        that.respond(null, status, headers, [servePath], stat, req, res, finish);
      } else if (stat.isDirectory()) { // Stream a directory of files.
        that.serveDir(servePath, req, res, finish);
      } else {
        finish(400, {});
      }
    });
  } else {
    // Forbidden
    finish(403, {});
  }
  return promise;
};

Server.prototype.parsePath = function(pathname, req) {
  var that = this,
      params = {absPath: that.resolve(pathname)},
      key, servePath, allowOutside = false;

  if (!that.options.alias) { return params.absPath; }

  if (req.headers) {
    // The strange HTTP header like a 'reqPath' may come from client. But, ignore it.
    for (key in req.headers) {
      if (key !== 'absPath') { params[key] = req.headers[key] + ''; }
    }
  }

  params.reqPath = pathname;
  params.reqDir = path.dirname(params.reqPath);
  params.absDir = path.dirname(params.absPath);
  params.fileName = path.basename(params.reqPath);
  // params.suffix = path.extname(params.reqPath).replace(/^\./, '');
  params.basename = params.fileName.replace(/^([^\.].*)\.([^\.]*)$/,
    function(s, basename, suffix) {
      params.suffix = suffix;
      return basename;
    });
  params.suffix = params.suffix != null ? params.suffix : '';

  that._log('(%s) Requested: "%s"', params.reqPath, params.absPath);

  function inRoot(servePath) {
    return (platform === 'win32' ?
        servePath.toLowerCase().indexOf(that.root.toLowerCase()) :  // Windows
        servePath.indexOf(that.root)                                // Others
      ) === 0 ? servePath : false;
  }

  function parseTemplate(template) {
    return template.replace(/<\%\s*(.+?)\s*\%>/g, function(s, key) {
        return params[key] != null ? params[key] : '';
      });
  }

  return that.options.alias.some(function(alias, iAlias) {
      var iMatch;
      if (!alias.match.some(function(match, i) {
            var key, value;
            if (typeof match === 'string') {
              value = match.replace(/^(?:(.*?)\=)?(.*)$/, function(s, pKey, pValue) {
                key = pKey;
                return pValue;
              });
              if (params[key || 'reqPath'] === value) {
                iMatch = i;
                return true;
              } else {
                return false;
              }
            } else {
              if (typeof match === 'object' && match instanceof RegExp &&
                                                  match.test(params.reqPath) ||
                  typeof match === 'function' &&  match(params)) {
                iMatch = i;
                return true;
              } else {
                return false;
              }
            }
          })) {
        return false;
      }
      // matched
      return alias.serve.some(function(serve, iServe) {
          var absPath =                   // Not that.resolve() because it's not uri.
            typeof serve === 'string' ?   path.resolve(that.root, parseTemplate(serve)) :
            typeof serve === 'function' ? path.resolve(that.root, serve(params)) :
                                          params.absPath;
          if (alias.force || fs.existsSync(absPath)) {
            servePath = absPath;
            allowOutside = alias.allowOutside;
            that._log('(%s) For Serve: "%s" alias[%d] match[%d] serve[%d]',
                params.reqPath, servePath, iAlias, iMatch, iServe);
            return true;
          } else { return false; }
        });
    }) ? (allowOutside ? servePath : inRoot(servePath)) :
    inRoot(params.absPath);
}

exports.Server = Server;
exports.mime = staticSuper.mime;
