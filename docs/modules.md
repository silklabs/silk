# Modules

silk-core is one big repository full of the various bits that make our
platform work. The majority of these bits are JavaScript modules.

NPM by default does not provide a good experience for a big repository
layout like this. You have a few options:

 - Use file: (which copies all your files and reinstalls dependencies
   for each module include).

 - Use `npm link` which leads to easily confusing situations where one
   person is using linked module and another is not (and you have to
   each and every module that is created).

To make it easier to create/edit/use modules we have made an addition to
nodes packaging system which allows modules to be symlinked (reference
each other in tree).

```js
// JS format used for clarity be careful if you copy/paste this into a
// json file...
{
  // Typical module dependencies usually fetched from npm
  "dependencies": {
    "module": "version"
  },
  "silkDependencies": {
    // Reference silk-server from this module... Note that the "root"
    // (/) is silk-core
    "silk-server": "/server"
  }
}
```

Dependencies created this way have the following benefits:

  - npm install is only on the dependency when package.json or the dependencies
    code changes. This yields large performance improvements but still
    provides a modest guarantee that the code is up to date without blowing
    away the entire `node_modules` folder (note: you can still break this by
    editing it manually).

  - Once installed you can edit the dependency directly without running
    npm install to pick up each change.
