
var lift = require('./')

/**
 * apply arguments to the last argument
 * 
 * @param {x} ...
 * @param {Function} fn
 * @return {x}
 */

module.exports = lift(function(){
  return arguments[--arguments.length].apply(this, arguments)
})
