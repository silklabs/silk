
var Result = require('result')
var lift = require('./cps')
var fs = require('fs')

for (var key in fs) {
  // sync returns
  exports[key] = /Sync$|Stream$|^Stats$|watch|^_/.test(key)
    ? fs[key]
    : lift(fs[key])
}

// exists is "special"
var exists = fs.exists
exports.exists = function(path){
  var result = new Result
  exists(path, function(value){
    result.write(value)
  })
  return result
}
