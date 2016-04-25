# Babel 6 Tooling for Silk

Babel has many moving pieces this module is designed to build our
commonly used babel components (such as babel-register) once and then
check them into the tree...

This has a number of benefits:

 - fewer npm dependencies for babel-register (register is roughly 11mb)

 - no moving pieces for our common silk-cli setup (since we use a
   prebuilt preset).

 - easy to patch if needed.

 - faster (by about 300-400ms to load).

## Usage:

Directly reference it from an absolute path in your package:

```js
require(__dirname + '/../babel/register')({
  // options ...
})
```

## Building new version:

```sh
npm run compile
# Check in register.js
```
