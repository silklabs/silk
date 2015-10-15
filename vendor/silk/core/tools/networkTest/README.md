Network Connectivity Tests
==========================

Tests network connectivity and performance to Silk server

Install
-------

```
npm install
```

Run
---

```
node start
```

Options
-------

You can add options, e.g. to print help of all options (note the extra `--`):
```
node start -- --help
```

Of note, add `-s <url>` to specifiy a specific serverUrl, e.g.
```
node start -- -s http://192.168.1.2:5000
```

Distribution
------------

`dist/networkTest.js` is a self-contained node.js program. Run on any machine
like this:

```
node --harmony networkTest.js
```

All of the above options still apply, though remove the `--`, so
things like this work:

```
node --harmony networkTest.js --help
```
