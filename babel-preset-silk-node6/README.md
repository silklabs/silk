# Silk Babel Preset (Node 6)

This is a flattened babel-preset for node 6.x LTS ...

This project does not ship with the entire set of babel plugins as npm
dependencies instead it flattens all the dependencies into a single fast
loading file (built /w webpack).

## Performance differences?

Babel performs a relatively complex preset merging process which adds
overhead (it needs to require each preset then all the plugins) in
production this added up to about `3s` of overhead in our usage.

Part of this slowness is related to the lack of advanced deduping in
npm2 (which we are still currently pinned to) but gains can be seen even
using npm3 on vanilla stage-0 install (1.01s vs 1.8s to boot
babel-node).

## How to build:

1. Run `npm run compile`
2. Check in `index.js` to source tree
3. Ignore/revert changes to `package.json`

# LICENSE

[MIT](./LICENSE.md)
