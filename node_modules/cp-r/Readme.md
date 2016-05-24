
# cp-r

  `cp -R` for node with no options

## Installation

With your favorite package manager:

- [packin](//github.com/jkroso/packin): `packin add cp-r`
- [npm](//npmjs.org/doc/cli/npm-install.html): `npm install cp-r`

then in your app:

```js
var copy = require('cp-r')
```

## API

### copy(a, b)

  Copy whatever is at `a` to `b`. Be that a file, directory, or symlink.

```js
copy('test', 'tmp').read(function(){
  console.log('done!')
})
```