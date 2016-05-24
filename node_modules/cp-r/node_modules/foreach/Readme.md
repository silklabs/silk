
# foreach

  iterate over key value pairs, arrays and objects. There are also two alternative asynchronous implementations with matching api's

## Installation

With your favourite package manager:

- [packin](//github.com/jkroso/packin): `packin add jkroso/forEach`
- [component](//github.com/component/component#installing-packages): `component install jkroso/forEach`
- [npm](//npmjs.org/doc/cli/npm-install.html): `npm install jkroso/forEach`

then in your app:

```js
var foreach = require('foreach')
var async = require('foreach/async')
var series = require('foreach/series')
```

## API

### foreach(object, iterator, context)

  apply `iterator` to each key value pair in `object`. The value is passed as the first argument and the key as the second. If you pass `context` that will be the value of `this` inside of `iterator`.

```js
function log(v, k){
  console.log('key: %s, value: %s', k, v)
}
foreach({a:1,b:2}, log)
// => key: a, value 1
// => key: b, value 2
foreach([1,2], log)
// => key: 0, value 1
// => key: 1, value 2
```

### async(object, iterator, context)

  Same API as the sync version except it will return a [Result](//github.com/jkroso/result) object, which will either, resolve when all items have been processed or fail when one fails. No ordering is guaranteed between items. Arguments you pass into `async` can also be wrapped in Result objects with the desired effect.

```js
async([20, 10, 0], function(value, i){
  var result = new Result
  setTimeout(function(){
    result.write()
  }, value)
  return result
}).then(function(){
  // This function runs after all async processes have completed
  // Note that in this example the last iteration will complete before
  // the first because all iterations are run in parrallel and the last 
  // one completes in the shortest time
})
```

### series(object, iterator, context)

  Like `async` but the next item will not be processed until the previous one completes