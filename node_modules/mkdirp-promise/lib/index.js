'use strict'

var Promise = require('pinkie-promise')
var mkdirp = require('mkdirp')

module.exports = function (dir, opts) {
  return new Promise(function (_resolve, _reject) {
    mkdirp(dir, opts, function (err, made) {
      return err === null ? _resolve(made) : _reject(err)
    })
  })
  .catch(function (err) {
    throw err
  })
}
