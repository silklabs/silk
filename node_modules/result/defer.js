
var Result = require('./index')
var listen = Result.prototype.listen
var transfer = Result.transfer

/**
 * Deferred class
 */

function Deferred(fn){
  this.onNeed = fn
}

/**
 * inherit from Result
 */

Deferred.prototype = new Result
Deferred.prototype.constructor = Deferred

/**
 * add a trigger aspect to listen. This aspect ensures
 * `onNeed` is called the first time someone reads from
 * the Deferred result
 *
 * @param {Function} method
 * @return {Function}
 * @api private
 */

Deferred.prototype.listen = function(onValue, onError){
  listen.call(this, onValue, onError)
  if (this.called) return
  this.called = true
  try {
    transfer(this.onNeed(), this)
  } catch (e) {
    this.error(e)
  }
}

/**
 * create a Deferred which is associated with the
 * Function `onNeed`. `onNeed` will only be called
 * once someone actually reads from the Deferred.
 *
 *   defer(function(){ return 'hello' })
 *   defer(function(cb){ cb(null, 'hello') })
 *   defer(function(write, error){ write('hello') })
 *
 * @param {Function} onNeed(write, error)
 * @return {Deferred}
 */

function defer(onNeed){
  switch (onNeed.length) {
    case 2:
      return new Deferred(function(){
        var res = new Result
        onNeed.call(this,
          function(v){ res.write(v) },
          function(e){ res.error(e) })
        return res
      })
    case 1:
      return new Deferred(function(){
        var result = new Result
        onNeed.call(this, function(error, value){
          if (error != null) result.error(error)
          else result.write(value)
        })
        return result
      })
      default:
        return new Deferred(onNeed)
  }
}

module.exports = defer // expose defer
defer.prototype = Deferred.prototype // share prototypes
defer.Deferred = Deferred // expose class
