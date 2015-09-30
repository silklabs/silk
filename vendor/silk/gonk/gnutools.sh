# Copyright (c) 2015 Silk Labs, Inc.
# All Rights Reserved.
# Confidential and Proprietary - Silk Labs, Inc.

if [ $(uname) = "Darwin" ]; then
  # Ensure the host system has the right tools pre-installed
  PACKAGES="gnu-sed coreutils gnu-tar"
  for package in $PACKAGES; do
    if [ ! -d /usr/local/opt/$package/libexec/gnubin ]; then
      echo
      echo Notice: /usr/local/opt/$package/libexec/gnubin does not exist.  Installing $package...
      echo
      ( set -x; brew install $package )
    fi
    PATH="/usr/local/opt/$package/libexec/gnubin:$PATH"
  done

  if ! cp --version | grep -q GNU; then
    echo "Error: GNU cp not found at $(which cp)"
    exit 1
  fi
fi
