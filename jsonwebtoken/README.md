# ?

Both silk-server and silk-api depend on jsonwebtoken which
currently points to a git url. While npm will generally handle
concurrent installs it cannot handle the case of two git urls
being installed at the same time by two consumers.
