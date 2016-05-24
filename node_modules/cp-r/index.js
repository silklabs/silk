
var lift = require('lift-result/cps')
var mkdir = lift(require('mkdirp'))
var each = require('foreach/async')
var fs = require('lift-result/fs')
var join = require('path').join
var Result = require('result')

module.exports = dispatch

/**
 * copy whatever is at `a` to `b`
 *
 * @param {String} a
 * @param {String} b
 * @return {Promise}
 */

function dispatch(a, b){
  return fs.lstat(a).then(function(s){
    if (s.isFile()) return copyFile(a, b, s)
    if (s.isDirectory()) return copyDir(a, b, s)
    if (s.isSymbolicLink()) return fs.symlink(fs.readlink(a), b)
  })
}

/**
 * copy `a` and its contents to `b`
 *
 * @param {String} a
 * @param {String} b
 * @param {Object} options
 * @return {Promise}
 */

function copyDir(a, b, opts){
  return mkdir(b, opts).then(function(){
    return each(fs.readdir(a), function(name){
      return dispatch(join(a, name), join(b, name))
    })
  })
}

/**
 * Copy file `a` to `b`
 *
 * @param {String} a
 * @param {String} b
 * @param {Object} options
 * @return {Promise}
 */

function copyFile(a, b, opts){
  var result = new Result

  function done(err) {
    if (result.state != 'pending') return
    read.destroy()
    write.destroy()
    if (err) result.error(err)
    else result.write()
  }

  var write = fs.createWriteStream(b, opts)
    .on('error', done)
    .on('close', done)

  var read = fs.createReadStream(a)
    .on('error', done)
    .pipe(write)

  return result
}
