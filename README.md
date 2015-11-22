# Silk

This is the unified Silk repository containing most of Silk's proprietary code.

It is currently merely a merger of a bunch of individual repositories,
but it will soon take over from them.

## Pulling in upstream changes

Simply run
```
./tools/pull.sh
```
to pull and merge the latest changes from the individual repositories. You can then push them as usual:
```
git push origin master
```

Importing a new repo that doesn't exist yet as a subtree can be done with the following command:
```
git subtree add \
  -m "Initial import of silk-$foobar into $foobar/" \
  --prefix $foobar \
  git@github.com:silklabs/silk-$foobar.git master
```
