# Babel plugin for rewriting requires/imports

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

With the following option enabled, `require()` calls that do not have
a string literal argument (e.g. `require('cry'+'pto') will be replaced
with an exception being thrown:

```json
{
  "throwForNonStringLiteral": true
}
```

If the file that an import or `require()` call would resolve to is
missing, it's usually up to node or the packager (e.g. webpack) to
deal with that -- potentially creating the bundle would fail at build
time rather than incurring an exception at runtime (which is what
happens in node). To replace the import of an non-existent file or
module with a runtime exception, use the following option:

```json
{
  throwForMissingFiles: [
    "/path/to/some/optional/configuration.json",
    "/path/to/build.artifact"
  ]
}
```
