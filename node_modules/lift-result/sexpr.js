
var lift = require('./')
var call = Function.call

/**
 * apply rest of args to `fn`
 *
 * @param {Function} fn
 * @param {x} ...
 * @return {x}
 */

module.exports = lift(function(fn){
  switch (arguments.length) {
    case 2: return fn.call(this, arguments[1])
    case 3: return fn.call(this, arguments[1], arguments[2])
    case 4: return fn.call(this, arguments[1], arguments[2], arguments[3])
    default:
      var ƒ = fn
      arguments[0] = this
      return call.apply(ƒ, arguments)
  }
})
