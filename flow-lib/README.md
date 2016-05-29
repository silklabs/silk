This directory contains Flow interface files that use the `declare module`
syntax. This syntax has several disadvantages and bugs, and is therefore
discouraged. You can use one of two options instead:

(a) Add a `.js.flow` file next to the code that, for whatever reason,
can't have inline Flow declarations, e.g. when it's native code:

```
silk-foobar/package.json
silk-foobar/bindings.cpp
silk-foobar/index.js.flow
```

(b) Add a `.js.flow` file with a `@providesModule` Haste-style
directive to the `/flow-interfaces` directory, e.g.:

```js
/**
 * @providesModule silk-foobar
 * @flow
 */
```
