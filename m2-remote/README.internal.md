# Maven2 repository for external dependencies

Use `silk m2-remote-update` to update this repository when new
dependencies are added or existing ones are updated. When doing so,
it's a good idea to

- wipe out any build directories (best to start with a freshly zested
  tree),

- wipe out your local gradle cache (~/.gradle/cache),

- wipe the contents of this directory clean so we don't end up with
  multiple versions of the same package (unless we have disjoint
  dependency trees, which is currently not the case).
