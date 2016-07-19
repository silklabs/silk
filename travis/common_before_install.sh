#
# Travis before_install things that most builds should run
#

git --version
git config --global user.email "stooge@silklabs.com"
git config --global user.name "Stooge"
git config --global color.ui false
if [ $TRAVIS_OS_NAME == osx ]; then
  echo HOME: $HOME # log.debug
  echo PWD: $PWD   # log.debug

  mkdir $HOME/.nvm
  export NVM_DIR="$HOME/.nvm"

  # Update brew twice because the first run can fail: https://github.com/Homebrew/homebrew/issues/42553
  brew update; brew update
  brew reinstall cmake coreutils libtool xz
  brew install nvm

  source $(brew --prefix nvm)/nvm.sh
  npm config set spin=false
fi
nvm install 4.2
nvm use 4.2
node --version
npm --version
