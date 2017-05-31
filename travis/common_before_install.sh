#
# Travis before_install things that most builds should run
#

git --version
git config --global user.email "stooge@silklabs.com"
git config --global user.name "Stooge"
git config --global color.ui false
if [ -n ${TRAVIS:-false} ]; then
  if [ $CI_OS_NAME == linux ]; then
    # Install ninja
    wget -q https://github.com/ninja-build/ninja/releases/download/v1.7.2/ninja-linux.zip
    unzip ninja-linux.zip
    sudo cp ninja /usr/bin
    sudo chmod +x /usr/bin/ninja
    rm -r ninja-linux.zip ninja
    if [[ ! -x /usr/bin/ninja ]]; then
      # TODO: Perhaps use ~/bin/ instead?
      echo "/usr/bin/ninja missing, sudo failed?"
    fi
  fi
  if [ $CI_OS_NAME == osx ]; then
    # Travis OS X machines need some more installing.
    echo HOME: $HOME # log.debug
    echo PWD: $PWD   # log.debug

    mkdir $HOME/.nvm
    export NVM_DIR="$HOME/.nvm"

    # Update brew twice because the first run can fail: https://github.com/Homebrew/homebrew/issues/42553
    brew update; brew update
    brew reinstall cmake coreutils libtool xz
    brew install ninja
    brew install nvm

    source $(brew --prefix nvm)/nvm.sh
    npm config set spin=false
  fi
fi

NODE_VERSION=6.10.3
if [[ $(node --version) != v${NODE_VERSION} ]]; then
  nvm install $NODE_VERSION
  nvm use $NODE_VERSION
fi
node --version
npm --version
