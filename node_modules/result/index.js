
var ResultType = require('result-type')
var ResultCore = require('result-core')
var listen = ResultCore.prototype.listen

/**
 * expose `Result`
 */

module.exports = exports = Result

/**
 * expose helpers
 */

exports.wrap = exports.done = wrap
exports.transfer = transfer
exports.Type = ResultType
exports.coerce = coerce
exports.failed = failed
exports.unbox = unbox
exports.when = when
exports.read = read

/**
 * the Result class
 */

function Result(){}

/**
 * inherit from ResultCore
 */

Result.prototype = new ResultCore
Result.prototype.constructor = Result

/**
 * Create a Result for a transformation of the value
 * of `this` Result
 *
 * @param  {Function} onValue
 * @param  {Function} onError
 * @return {Result}
 */

Result.prototype.then = function(onValue, onError) {
  switch (this.state) {
    case 'fail': onValue = onError // falls through
    case 'done':
      if (!onValue) return this
      try {
        return coerce(onValue.call(this, this.value))
      } catch (e) {
        return failed(e)
      }
    default:
      var x = new Result
      this.listen(
        handle(x, onValue, 'write', this),
        handle(x, onError, 'error', this))
      return x
  }
}

/**
 * read using a node style function
 *
 *   result.node(function(err, value){})
 *
 * @param  {Function} [callback(error, value)]
 * @return {this}
 */

Result.prototype.node = function(fn){
  if (typeof fn != 'function') return this
  return this.read(function(v){ fn(null, v) }, fn)
}

/**
 * Create a child Result destined to fulfill with `value`
 *
 *   return result.then(function(value){
 *     // some side effect
 *   }).yield(e)
 *
 * @param  {x} value
 * @return {Result}
 */

Result.prototype.yield = function(value){
  return this.then(function(){ return value })
}

/**
 * return a Result for `this[attr]`
 *
 * @param {String} attr
 * @return {Result}
 */

Result.prototype.get = function(attr){
  return this.then(function(obj){ return obj[attr] })
}

/**
 * wrap `reason` in a "failed" result
 *
 * @param {x} reason
 * @return {Result}
 * @api public
 */

function failed(reason){
  var res = new Result
  res.value = reason
  res.state = 'fail'
  return res
}

/**
 * wrap `value` in a "done" Result
 *
 * @param {x} value
 * @return {Result}
 * @api public
 */

function wrap(value){
  var res = new Result
  res.value = value
  res.state = 'done'
  return res
}

/**
 * coerce `value` to a Result
 *
 * @param {x} value
 * @return {Result}
 * @api public
 */

function coerce(value){
  if (!(value instanceof ResultType)) return wrap(value)
  if (value instanceof Result) return value
  var result = new Result
  switch (value.state) {
    case 'done': result.write(value.value); break
    case 'fail': result.error(value.value); break
    default:
      (value.listen || listen).call(value,
        function(value){ result.write(value) },
        function(error){ result.error(error) })
  }
  return result
}

/**
 * create a function which will propagate a value/error
 * onto `result` when called. If `fn` is present it
 * will transform the value/error before assigning the
 * result to `result`
 *
 * @param {Function} result
 * @param {Function} fn
 * @param {String} method
 * @param {Any} [ctx]
 * @return {Function}
 * @api private
 */

function handle(result, fn, method, ctx){
  return typeof fn != 'function'
    ? function(x){ return result[method](x) }
    : function(x){
      try { transfer(fn.call(ctx, x), result) }
      catch (e) { result.error(e) }
    }
}

/**
 * run `value` through `onValue`. If `value` is a
 * "failed" promise it will be passed to `onError`
 * instead. Any errors will result in a "failed"
 * promise being returned rather than an error
 * thrown so you don't have to use a try catch
 *
 * @param {Any} result
 * @param {Function} onValue
 * @param {Function} onError
 * @return {Any}
 */

function when(value, onValue, onError){
  if (value instanceof ResultType) switch (value.state) {
    case 'fail':
      if (!onError) return value
      onValue = onError
      value = value.value
      break
    case 'done':
      value = value.value
      break
    default:
      var x = new Result
      var fn = value.listen || listen // backwards compat
      fn.call(value,
        handle(x, onValue, 'write', this),
        handle(x, onError, 'error', this))
      // unbox if possible
      return x.state == 'done' ? x.value : x
  }
  if (!onValue) return value
  try { return onValue.call(this, value)  }
  catch (e) { return failed.call(this, e) }
}

/**
 * read `value` even if its within a promise
 *
 * @param {x} value
 * @param {Function} onValue
 * @param {Function} onError
 */

function read(value, onValue, onError){
  if (value instanceof ResultType) value.read(onValue, onError)
  else onValue(value)
}

/**
 * transfer the value of `a` to `b`
 *
 * @param {Any} a
 * @param {Result} b
 */

function transfer(a, b){
  if (a instanceof ResultType) switch (a.state) {
    case 'done': b.write(a.value); break
    case 'fail': b.error(a.value); break
    default:
      var fn = a.listen || listen // backwards compat
      fn.call(a,
        function(value){ b.write(value) },
        function(error){ b.error(error) })
  } else {
    b.write(a)
  }
}

/**
 * attempt to unbox a value synchronously
 *
 * @param {Any} value
 * @return {Any}
 * @throws {Error} If given a pending result
 * @throws {Any} If given a failed result
 */

function unbox(value){
  if (!(value instanceof ResultType)) return value
  if (value.state == 'done') return value.value
  if (value.state == 'fail') throw value.value
  throw new Error('can\'t unbox a pending result')
}
