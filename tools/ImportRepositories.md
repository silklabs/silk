# Importing Projects from Other Repositories to This Repo

To import a project with all of its history from another git
repository, use the `git-subtree` command:

```
git remote add -f foobar git@github.com:silklabs/foobar.git
git subtree add \
  -m "Initial import of foobar into foobar/" \
  --prefix foobar \
  git@github.com:silklabs/foobar.git master
```

If you need to update the imported directory periodically while the
original repository is still active during a transition phase, use the
following command:

```
git remote add -f foobar git@github.com:silklabs/foobar.git
git subtree merge \
  --prefix foobar \
  -m "Merge branch 'master' of github.com/silklabs/foobar" \
  remotes/foobar/master
```
