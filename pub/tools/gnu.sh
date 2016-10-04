# Checks for the required GNU tools on OS X

if [ $(uname) = "Darwin" ]; then
  # Ensure the host system has the right tools pre-installed
  PACKAGES="gnu-sed coreutils gnu-tar"
  for package in $PACKAGES; do
    if [ ! -d /usr/local/opt/$package/libexec/gnubin ]; then
      if [ -z $FULL_SERVICE ]; then
        echo Please install $package to continue.
        echo "Hint: |brew install $package|"
        exit 1
      fi
      echo
      echo Notice: /usr/local/opt/$package/libexec/gnubin does not exist.  Installing $package...
      echo
      ( set -x; brew install $package )
    fi

    __TOOLPATH=/usr/local/opt/$package/libexec/gnubin
    PATH=${PATH//":$__TOOLPATH"/} # Maybe remove __TOOLPATH in the middle or end of PATH
    PATH=${PATH//"$__TOOLPATH:"/} # Maybe remove __TOOLPATH at the beginning of PATH
    PATH="$__TOOLPATH:$PATH"      # Add __TOOLPATH to the beginning of PATH
    unset __TOOLPATH
  done

  if ! which -s wget; then
    if [ -z $FULL_SERVICE ]; then
      echo Please install wget to continue.
      echo "Hint: |brew install wget|"
      exit 1
    fi
    ( set -x; brew install wget )
  fi

  if ! cp --version | grep -q GNU; then
    echo "Error: GNU cp not found at $(which cp)"
    exit 1
  fi

  if cp --version | grep -q 8.23; then
    echo "Error: cp from GNU coreutils 8.23 has hardlink bugs, please upgrade to >= 8.24"
    exit 1
  fi
fi
