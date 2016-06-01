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
