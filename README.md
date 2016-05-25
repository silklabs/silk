# Silk Core
This is the unified repository containing our product code and tooling.

https://travis-ci.com/silklabs/silk-core/builds

## Setting up CLI environment:

The core of our OSS developer experience is being built around the `cli`
folder which facilitates the ability to load various plugins and
extensions. This repository contains a number of "internal" plugins
which can be loaded from the silk-cli.

```sh
source setup
cd cli-plugin-internal
npm install
silk --help
```

NOTE: That by running above this will "pin" the silk-cli to that
particular checkout of silk-core. This means you can use `silk` from
anywhere (including outside of the tree from that terminal) but will
prevent loading plugins from other trees or extensions.

## Useful Links:

### Documentation:

[/docs]

### NPM Tools

We are in the process of moving `npm` modules into the tree. Not all
modules are ready for this treatment (any modules which have native
dependencies).

#### Checking in module dependencies into the tree:

For a new module with new dependencies.

1. Add dependencies to the package.json
2. Run `silk npm-install <path>`
3. Check in (`git add`) `<path>`/node_modules/
4. Check in (`git add`) `<silk core>`/node_modules

NOTE: `pub/` has a node_modules folder but no tooling. You will need to manually edit `pub/package.json` and run `npm install` and check in the results of `pub/node_modules/`.

#### Upgrading a package across the entire tree:

First it's often useful to see who is using the module:

```
silk npm-pkg-search <module>
```

Then upgrade it (Only one version of a given module may exist in the tree at once)

```
silk npm-pkg-upgrade <module> <version>
```

This will globally update every package.json referencing the package and update the root `node_modules` folder.


### Metrics:

https://hilldale-delorean-43.c.influxdb.com:3000
user: e@silk.io
pass: raccoon
