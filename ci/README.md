# CI

Various CI utilities to be called by travis yml.


## ccache

A common operation is to save a ccache for a particular build type.

### Usage:

(path assumes somewhere in a top level folder path to ci may vary).

```yml
before_install:
 - ../ci/ccache_pull.sh

after_script:
 - ../ci/ccache_push.sh
```

Each has additional options (use --help to see them).


## Native node modules

It's often useful to build and push native modules for creating
prebuilts for linux or darwin.

This will create an archive with the build/Release directory and any
.node files contained within.

```yml
after_script:
 - ../ci/native_node_build_push.sh
```
