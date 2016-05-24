
# lift-result

  lift functions so they can handle [results](//github.com/jkroso/result) as if they were plain values.

## Installation

With your favourite package manager:

- [packin](//github.com/jkroso/packin): `packin add lift-result`
- [component](//github.com/component/component#installing-packages): `component install jkroso/lift-result`
- [npm](//npmjs.org/doc/cli/npm-install.html): `npm install lift-result`

then in your app:

```js
var lift = require('lift-result')
var liftCPS = require('lift-result/cps')
var apply = require('lift-result/apply')
var sexpr = require('lift-result/sexpr')
```

## API

### lift(fn)

  decorate `fn` so it can receive promises as arguments. Return
  values will be unboxed wherever possible however errors will
  be caught and boxed with a promise since this means you don't
  have to handle sync and async errors separately.

```js
var Result = require('result')
var add = lift(function(a, b){ return a + b })
add(1, 2) // => 3
add(Result.wrap(1), 2) // => 3
var one = new Result
var answer = add(one, 2) // => new Result
one.write(1)
answer.value // => 3
```

### cps(fn)

  decorate a node function so it can receive Results as arguments and will return a result rather than take a callback as its last argument.

```js
var fs = require('fs')
var readFile = liftCPS(fs.readFile)
readFile('Readme.md').read(function(buf){
  buf // => fs.readFileSync('Readme.md')
})
```

### apply(..., fn)

  apply arguments to the last argument

```js
apply(Result.wrap(1), 2, Array) // => [1, 2]
```

### sexpr(fn, ...)

  apply rest of args to `fn`

```js
sexpr(Array, Result.wrap(1), 2) // => [1, 2]
```