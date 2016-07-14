# npm-extractor

This module (both via js and via cli) can extract a set of modules and
all their dependencies (including nested dependencies, etc..) from
`<CORE>/node_modules` into another folder. This is useful for deploying
a subset of our `node_modules` folder for pub, servers, etc..

## Usage:

(See the test for js usage)

```sh
# from <CORE>
./npm-extractor/bin/extract aws-sdk,babel-cli <DEST>
```
