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

To import a new repo that doesn't exist as yet as a subtree, follow this great tutorial on git subtree merging: http://nuclearsquid.com/writings/subtree-merging-and-you/
