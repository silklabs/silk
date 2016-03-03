#! /bin/bash -ex

BUILDER=$(whoami)

# We copy files into the container before starting it this means all these files
# under workspace belong to root ... We have sudo powers so we can correct this.
sudo chown -R $BUILDER:$BUILDER /home/$BUILDER

# cd into the first directory ...
ls -lah $HOME/workspace;
cd $HOME/workspace

if [ ! -f binding.gyp ];
then
  ls -lah .
  echo "binding.gyp is missing. Is this a native module ?"
  exit 1;
fi

# install module in production mode ... This is probably not the ideal method of
# building the native module since we pull in other network dependencies but
# ensures that most modules work.

npm install --production
