
/**
 * Synchronous each
 *
 * @param {Object|Array} obj
 * @param {Function} fn (value, key)
 * @param {Object} [context]
 * @return {undefined}
 */

module.exports = function(obj, fn, ctx){
	if (obj == null) return
	var l = obj.length
	if (typeof l == 'number') {
		for (var k = 0; k < l; k++) {
			fn.call(ctx, obj[k], k)
		}
	} else {
		for (var k in obj) {
			fn.call(ctx, obj[k], k)
		}
	}
}
