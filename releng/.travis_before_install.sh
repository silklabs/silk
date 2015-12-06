git config --global user.email "shipit@silklabs.com"
git config --global user.name "Release Engineering"
git config --global color.ui false
if [ $TRAVIS_OS_NAME == osx ]; then
  curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash
  source ~/.nvm/nvm.sh
fi
nvm install 4.1.2
nvm use 4.1.2
node --version
npm --version
npm install
