sort-json
=========

Takes a json-file and return a copy of the same file, but with the keys sorted

installation
------------

` [sudo] npm -g install sort-json`


usage
-----

```js
var sortJson = require('sort-json');

var copy = sortJson(object);
```

CLI usage
---------
`sort-json file.json`

For now sort-json takes no other arguments, so the origin file will be overritten by a sorted json file with 2-space indentation.