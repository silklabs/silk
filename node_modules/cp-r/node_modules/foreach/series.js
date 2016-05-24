
var lift = require('lift-result')
var Result = require('result')
var when = Result.read

/**
 * Asynchronous but sequential each
 *
 * @param {Object|Array} obj
 * @param {Function} fn(value, key)
 * @param {Object} [context]
 * @return {Result}
 */

module.exports = lift(function(obj, fn, ctx){
	if (obj == null) return Result.wrap()
	var pending = obj.length
	var result = new Result
	var i = 0

	var fail = function(e) {
		result.error(e)
	}

	// array
	if (typeof pending == 'number') {
		var next = function(){
			if (i === pending) return result.write()
			try { var ret = fn.call(ctx, obj[i], i++) }
			catch (e) { return fail(e) }
			when(ret, next, fail)
		}
	} else {
		var keys = []
		for (var k in obj) keys.push(k)
		var pending = keys.length
		var next = function(){
			if (i === pending) return result.write()
			var k = keys[i++]
			try { var ret = fn.call(ctx, obj[k], k) }
			catch (e) { return fail(e) }
			when(ret, next, fail)
		}
	}

	next()

	return result
})