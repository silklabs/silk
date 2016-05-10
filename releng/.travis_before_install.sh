git --version
git config --global user.email "stooge@silklabs.com"
git config --global user.name "Stooge"
git config --global color.ui false
if [ $TRAVIS_OS_NAME == osx ]; then
  mkdir ~/.nvm
  export NVM_DIR="~/.nvm"

  brew update
  brew reinstall cmake coreutils libtool nvm xz

  source $(brew --prefix nvm)/nvm.sh
  npm config set spin=false
fi
nvm install 4.2
nvm use 4.2
node --version
npm --version
