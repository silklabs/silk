## Javascript Rapid Development Cycle

If you are only making JavaScript changes to the extensions (`silk/ext/*/lib`) , the following may be used to
reduce your build time significantly.

### Automatic push

Run `./watch`, then edit/save normally. On every save, the new `index.js` will be
automatically installed on device and extension reloaded.

`./watch` options:
  * `./watch --reload-ext` - to tell silk core to reload the extension (see [Extensions Reloading](#extensions-reloading))

### Manual push and reload of extensions

```sh
.. edit .js files ..
$ npm install
$ adb push index.js /system/silk/ext/<extension-name>.js
$ adb shell setprop silk.reload-ext "/system/silk/ext/<extension-name>.js"
```

### Extensions Reloading

Note: extension module reloading only works if the extension has implemented `willUnload()`
