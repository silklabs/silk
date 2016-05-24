
var ResultType = require('result-type')
var nextTick = require('next-tick')

module.exports = Result

/**
 * the result class
 */

function Result(){}

/**
 * inherit from ResultType
 */

Result.prototype = new ResultType

/**
 * default state
 * @type {String}
 */

Result.prototype.state = 'pending'

/**
 * give `this` its value
 *
 * @param {x} value
 * @return {this}
 */

Result.prototype.write = function(value){
  if (this.state == 'pending') {
    this.state = 'done'
    this.value = value
    this._onValue && run(this, this._onValue)
  }
  return this
}

/**
 * give `this` its reason for failure
 *
 * @param {x} reason
 * @return {this}
 */

Result.prototype.error = function(reason){
  if (this.state == 'pending') {
    this.state = 'fail'
    this.value = reason
    this._onError && run(this, this._onError)
  }
  return this
}

/**
 * access the result of `this`
 *
 * @param {Function} onValue
 * @param {Function} onError
 * @return {this}
 */

Result.prototype.read = function(onValue, onError){
  switch (this.state) {
    case 'done':
      onValue && runFn(this, onValue)
      break
    case 'fail':
      if (onError) runFn(this, onError)
      else rethrow(this.value)
      break
    default:
      this.listen(onValue, onError || rethrow)
  }
  return this
}

/**
 * add listeners for the result
 *
 * @param {Function} onValue
 * @param {Function} onError
 * @return {this}
 */

Result.prototype.listen = function(onValue, onError){
  onValue && listen(this, '_onValue', onValue)
  onError && listen(this, '_onError', onError)
}

function listen(obj, prop, fn){
  var fns = obj[prop]
  if (!fns) obj[prop] = fn
  else if (typeof fns == 'function') obj[prop] = [fns, fn]
  else obj[prop].push(fn)
}

/**
 * dispatch to `runFn` on the type of `fns`
 *
 * @param {Function} fns
 * @param {ctx} Result
 * @api private
 */

function run(ctx, fns){
  if (typeof fns == 'function') runFn(ctx, fns)
  else for (var i = 0, len = fns.length; i < len;) {
    runFn(ctx, fns[i++])
  }
}

/**
 * run `fn` and re-throw any errors with a clean
 * stack to ensure they aren't caught unwittingly.
 * since readers are sometimes run now and sometimes
 * later the following would be non-deterministic
 *
 *   try {
 *     result.read(function(){
 *       throw(new Error('boom'))
 *     })
 *   } catch (e) {
 *     // if result is "done" boom is caught, while
 *     // if result is "pending" it won't be caught
 *   }
 *
 * @param {Function} fn
 * @param {Result} ctx
 * @api private
 */

function runFn(ctx, fn){
  try { fn.call(ctx, ctx.value) }
  catch (e) { rethrow(e) }
}

function rethrow(error){
  nextTick(function(){ throw error })
}
