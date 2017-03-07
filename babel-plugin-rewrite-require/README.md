# Babel plugin for rewriting requires/imports

## Module aliases

This plugin allows rewriting ES6 module imports and CommonJS-style
`require()` calls using a simple module alias map:

```json
{
  "aliases": {
    "some-module": "some-replacement-module",
    "another-module": "another-module/browser"
  },
}
```


## Non-string literals

With the following option enabled, `require()` calls that do not have
a simple string literal argument will be replaced with an exception
being thrown:

```json
{
  "throwForNonStringLiteral": true
}
```

This approach is used by several browserify modules to detect whether
their built-in counterparts are available (e.g. `require('cry'+'pto')`)
and should be enabled if you use this Babel plugin to alias node
built-in modules to browserify modules.


## Optional modules

A common pattern found in node modules is to check whether a certain
dependency is available:

```js
try {
  require('some-optional-dependency');
} catch (ex) {
  // Ignore, or load polyfill, or ...
}
```

Because React Native's packager resolves `require()` calls during
dependency resolution, it will require `'some-optional-dependency'` to
be present and resolvable. If this module will never be available to
your React Native app, and you want the runtime exception occur so
that the `catch` clause can do its thing, you can blacklist these
dependencies from ever being resolved. Instead, those `require()`
calls will be replaced with an exception being thrown:

```json
{
  "throwForModules": [
    "some-optional-dependency"
  ]
}
```


## Optional files

If the file that an import or `require()` call would resolve to is
missing, it's usually up to node or the packager (e.g. webpack) to
deal with that -- potentially creating the bundle would fail at build
time rather than incurring an exception at runtime (which is what
happens in node). To replace the import of an non-existent file or
module with a runtime exception, use the following option:

```json
{
  "throwForMissingFiles": [
    "/path/to/some/optional/configuration.json",
    "/path/to/build.artifact"
  ]
}
```
