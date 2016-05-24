
var Result = require('result')
var transfer = Result.transfer
var ResultType = Result.Type
var failed = Result.failed
var read = Result.read

/**
 * decorate `fn` so it can receive promises as arguments. Return
 * values will be unboxed wherever possible however errors will
 * be caught and boxed with a promise since this means you don't
 * have to handle sync and async errors separately.
 *
 * @param {Function} fn
 * @return {Function}
 */

module.exports = function(fn){
  decorated.plain = fn
  for (var key in fn) decorated[key] = fn[key]
  if (fn.prototype) decorated.prototype = fn.prototype
  function decorated(){
    var i = arguments.length

    // scan for Results
    while (i--) if (arguments[i] instanceof ResultType) {
      var self = this
      var args = arguments
      var result = new Result
      var fail = function(e){ result.error(e) }
      var next = function(value){
        args[i] = value
        if (i) return read(args[--i], next, fail)

        try { value = fn.apply(self, args) }
        catch (e) { return result.error(e)}

        if (value === undefined && self instanceof decorated) {
          return result.write(self)
        }
        transfer(value, result)
      }
      args[i].read(next, fail)
      // unbox if possible
      return result.state == 'done'
        ? result.value
        : result
    }

    // catch errors
    try { result = fn.apply(this, arguments) }
    catch (e) { return failed(e) }

    // used as a constructor
    if (result === undefined && this instanceof decorated) return this
    return result
  }
  return decorated
}
