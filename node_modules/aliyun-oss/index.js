'use strict';

var mime = require('mime-types'),
  assert = require('assert'),
  crypto = require('crypto'),
  Stream = require('stream'),
  xml2js = require('xml2js'),
  http = require('http'),
  url = require('url'),
  fs = require('fs');

var isArray = Array.isArray;

function OSS(options) {
  this.accessKeyId = options.accessKeyId;
  this.accessKeySecret = options.accessKeySecret;
  this.host = options.host || 'oss-cn-hangzhou.aliyuncs.com';
  this.port = options.port || 80;
  this.timeout = options.timeout || 300000; // 5 minutes

  if (options.hasOwnProperty('agent')) {
    this.agent = options.agent;
  } else {
    var agent = new http.Agent();
    agent.maxSockets = 20;
    this.agent = agent;
  }
}

/**
 * Generate Authorization header signature, or raw signature (if signOnly is true)
 *
 * @param {Request} - req
 * @param {string} - resource
 * @param {boolean} - signOnly (optional, default: false)
 */
OSS.prototype.generateSign = function(req, resource, signOnly) {
  var params = [];
  params.push(req.method);
  params.push(req.getHeader('Content-Md5') || '');
  params.push(req.getHeader('Content-Type') || '');
  params.push(req.getHeader('Date') || req.getHeader('Expires') || '');

  var keys = Object.keys(req._headers).sort();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase().indexOf('x-oss') !== -1) {
      params.push(keys[i].toLowerCase() + ':' + req._headers[keys[i]]);
    }
  }

  params.push(resource);

  var signature = crypto.createHmac('sha1', this.accessKeySecret).update(params.join('\n')).digest('base64');

  return signOnly ? signature : 'OSS ' + this.accessKeyId + ':' + signature;
};

/**
 * @param {object} - options
 *   required properties: method, bucket, object, headers
 *   optional properties: signHeaders, expires
 *
 *   signHeaders - If truthy, put signature in the header, else put
 *                 put signature in the URL. (default: true)
 *
 *   expires     - seconds until the signed URL will expire. Applies only
 *                 if signHeaders is false. (default: 600 secs)
 *
 */
OSS.prototype.getSignedUrl = function(options) {
  var signHeaders = ('signHeaders' in options) ? options.signHeaders : true;

  var now = new Date();

  // Create req objects with properties expected by helper functions
  var reqHeaders = Object.assign({}, options.headers);
  if (signHeaders) {
    // Use date when signing headers
    reqHeaders['Date'] = now.toUTCString();
  } else {
    // Use expires time (seconds from epoch) when signing the URL
    var expires = ('expires' in options) ? options.expires : 600;
    reqHeaders['Expires'] = Math.ceil(now.getTime() / 1000 + expires);
  }
  var req = {
    method: options.method,
    getHeader: function(key) { return reqHeaders[key]; },
    _headers: reqHeaders
  };

  // Calculate URL components
  var headers = {};
  var queryParams = {};
  if (signHeaders) {
    var signature = this.generateSign(req, getResource(options), false);
    headers = Object.assign(headers, options.headers);
    headers['Date'] = reqHeaders['Date'];
    headers['Authorization'] = signature;
  } else {
    var signature = this.generateSign(req, getResource(options), true);
    queryParams['OSSAccessKeyId'] = this.accessKeyId;
    queryParams['Expires'] = reqHeaders['Expires'];
    queryParams['Signature'] = signature;
  }

  // Generate URL
  var urlString = url.format({
    protocol: 'http:',
    hostname: options.bucket + '.' + this.host,
    port: this.port,
    pathname: getPath(options),
    query: queryParams,
  });

  return { url: urlString, headers: headers };
}

/**
 * @param {Request} - req
 * @param {object} - options
 */
OSS.prototype.setHeaders = function(req, options) {
  req.setHeader('Date', new Date().toGMTString());

  if (options.source) {
    var contentType = mime.lookup(options.source);

    if (contentType && !req.getHeader('Content-Type')) {
      req.setHeader('Content-Type', contentType);
    }
    // buffer
    if (Buffer.isBuffer(options.source)) {
      req.setHeader['Content-Length'] = options.source.length;
      req.setHeader['Content-Md5'] = crypto.createHash('md5').update(options.source).digest('base64');
    }
  }

  var resource = getResource(options);
  req.setHeader('Authorization', this.generateSign(req, resource, false));
};

/**
 * @param {string} - method
 * @param {object} - options
 * @param {function} - callback
 */
OSS.prototype.request = function(method, options, callback) {
  var self = this;
  var headers = options.headers || {};
  var path = getPath(options);
  var host = self.host;
  if (options.bucket) {
    host = options.bucket + '.' + host;
  }

  var req = http.request({
    method: method,
    host: host,
    port: self.port,
    path: path,
    headers: headers,
    timeout: self.timeout,
    agent: self.agent
  }, function(res) {
    var response = {};
    response.status = res.statusCode;
    response.headers = res.headers;

    var chunks = [],
      size = 0;

    if (options.dest) {
      var wstream = (typeof options.dest === 'string') ? fs.createWriteStream(options.dest) : options.dest;
      res.pipe(wstream);

      wstream.on('finish', function() {
        callback(null, response);
      });

      wstream.on('error', function(error) {
        callback(error);
      });
    } else {
      res.on('data', function(chunk) {
        chunks.push(chunk);
        size += chunk.length;
      });
    }

    res.on('end', function() {
      if (options.dest) {
        // callback when wstream finish
        return;
      }

      response.body = Buffer.concat(chunks, size);

      if (!size || res.headers['content-type'] !== 'application/xml') {
        return callback(null, response);
      }

      var parser = new xml2js.Parser();
      parser.parseString(response.body, function(error, result) {
        if (error) {
          error.status = response.status;
          error.code = 'XML Parse Error';
          return callback(error);
        }

        if (res.statusCode >= 400) {
          error = new Error();

          try {
            error.status = response.status;
            error.code = result.Error.Code;
            error.message = result.Error.Message;
            error.requestId = result.Error.RequestId;
          } catch (e) {
            error = e;
          }

          return callback(error);
        }

        response.body = result;
        callback(null, response);
      });
    });
  });

  self.setHeaders(req, options);

  req.on('error', function(error) {
    callback(error);
  });

  // http req body
  if (options.source) {
    if (options.source instanceof Stream) {
      options.source.pipe(req);
    } else if (typeof options.source === 'string') {
      dealSourceWithFilePath(options.source);
    } else if (Buffer.isBuffer(options.source)) {
      req.end(options.source);
    } else {
      req.end();
    }
  } else if (options.body) {
    req.end(options.body);
  } else {
    req.end();
  }

  function dealSourceWithFilePath(filepath) {
    fs.stat(filepath, function(error, stats) {
      if (error) {
        callback(error);
      } else {
        req.setHeader('Content-Length', stats.size);
        fs.createReadStream(filepath).pipe(req);
      }
    });
  }
};

/**
 * @param {function} - callback
 */
OSS.prototype.listBucket = function(callback) {
  callback = callback || noop;
  var options = {
    bucket: ''
  };

  this.request('GET', options, callback);
};

/**
 * @param {object} - { bucket: string, acl: string }
 */
OSS.prototype.createBucket = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  if (options.acl) {
    options.headers = {
      'x-oss-acl': options.acl
    };
  }

  this.request('PUT', options, callback);
};

/**
 * @param {object} - { bucket: string }
 */
OSS.prototype.deleteBucket = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  this.request('DELETE', options, callback);
};

/**
 * @param {object} - { bucket: string }
 */
OSS.prototype.getBucketAcl = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  options.isAcl = true;

  this.request('GET', options, callback);
};

/**
 * @param {object} - { bucket: string, acl: string }
 */
OSS.prototype.setBucketAcl = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  options.headers = {
    'x-oss-acl': options.acl
  };

  this.request('PUT', options, callback);
};

/**
 * @param {object} - { bucket: string, object: string, source: string|stream|buffer, headers: object }
 *
 * headers: {
 *   'Content-Type': 'text/plain',
 *   'Content-Length': 1024
 * }
 */
OSS.prototype.putObject = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  var host = this.host;

  this.request('PUT', options, function(error, result) {
    if (error) {
      return callback(error);
    }
    result.objectUrl = 'http://' + options.bucket + '.' + host + '/' + options.object;
    callback(null, result);
  });
};

/**
 * @param {object} - { bucket: string, object: string, sourceBucket: string, sourceObject: string }
 */
OSS.prototype.copyObject = function(options, callback) {
  options = options || {};
  callback = callback || noop;
  options.headers = options.headers || {};
  options.headers['x-oss-copy-source'] = '/' + options.sourceBucket + '/' + options.sourceObject;

  var host = this.host;

  this.request('PUT', options, function(error, result) {
    if (error) {
      return callback(error);
    }
    result.objectUrl = 'http://' + options.bucket + '.' + host + '/' + options.object;
    callback(null, result);
  });
};

/**
 * @param {object} - { bucket: string, object: string }
 */
OSS.prototype.deleteObject = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  this.request('DELETE', options, callback);
};

/**
 * put multi objects
 *
 * @param {object} - { bucket: string, quiet: boolean, objects: []string }
 */
OSS.prototype.deleteObjects = function(options, callback) {
  callback = callback || noop;

  if (!(options && isArray(options.objects) && options.objects.length)) {
    return callback(new Error('invalid options'));
  }

  options.isDel = true;

  var xml = '<?xml version="1.0" encoding="UTF-8"?><Delete>',
    end = '</Delete>';

  if (options.quiet) {
    xml += '<Quiet>true</Quiet>';
  } else {
    xml += '<Quiet>false</Quiet>';
  }

  options.objects.forEach(function(object) {
    xml += '<Object><Key>' + object + '</Key></Object>';
  });
  xml += end;

  // body
  options.body = xml;

  var md5 = crypto.createHash('md5').update(xml).digest('base64'),
    length = Buffer.byteLength(xml);

  // headers
  options.headers = {
    'Content-Md5': md5,
    'Content-Length': length
  };

  this.request('POST', options, callback);
};

/**
 * @param {object} - { bucket: string, object: string, dest: string|stream, headers: object }
 */
OSS.prototype.getObject = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  this.request('GET', options, callback);
};

/**
 * @param {object} - { bucket: string, object: string }
 */
OSS.prototype.headObject = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  this.request('HEAD', options, callback);
};

/**
 * @param {object} - { bucket: string, prefix: string, marker: string, delimiter: string, maxKeys: number }
 */
OSS.prototype.getBucket = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  this.request('GET', options, callback);
};

OSS.prototype.listObject = function(options, callback) {
  options = options || {};
  callback = callback || noop;

  this.request('GET', options, callback);
};

/**
 * exports
 */
exports.createClient = function(options) {
  assert(typeof options === 'object', 'invalid options');

  var client = new OSS(options);

  var wrapper = options.wrapper;
  if (wrapper) {
    require('thunkify-or-promisify')(client, wrapper, ['request', 'setHeaders', 'generateSign']);
  }

  return client;
};

/**
 * utils
 */
function noop() {}

function getResource(options) {
  var resource = '';

  if (options.bucket) {
    resource += '/' + options.bucket;
  }
  if (options.object) {
    resource += '/' + options.object;
  } else {
    resource += '/';
  }

  if (options.isAcl) return resource += '?acl';
  if (options.isDel) return resource += '?delete';

  return resource;
}

function getPath(options) {
  var path = '';

  // get bucket acl
  if (options.isAcl) return '/?acl';
  // delete multi objects
  if (options.isDel) return '/?delete';

  if (options.object) {
    path += '/' + encodeURIComponent(options.object);
  }

  var params = [];
  if (options.prefix) {
    params.push('prefix=' + encodeURIComponent(options.prefix));
  }
  if (options.marker) {
    params.push('marker=' + encodeURIComponent(options.marker));
  }
  if (options.maxKeys) {
    params.push('max-keys=' + options.maxKeys);
  }
  if (options.delimiter) {
    params.push('delimiter=' + encodeURIComponent(options.delimiter));
  }
  if (params.length) {
    path += '/?' + params.join('&');
  }

  return path;
}
