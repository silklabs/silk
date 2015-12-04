#!/bin/bash -e

if [[ ~ != /app ]]; then
  echo "(This does not look like the Heroku environment)"
  exit 0
fi

LOCAL_PATH=$(dirname $(readlink -f $0))

# Heroku needs help fetching private Github projects over SSH.  This is
# accomplished by defining the HEROKU_PRIVATE_KEY environment variable in the
# Config Variables section of the affected dynos, which is then set up by the
# script as the SSH identity.
if [[ -n $HEROKU_PRIVATE_KEY ]]; then

  echo Using HEROKU_PRIVATE_KEY

  mkdir -p /app/.ssh

  echo "$HEROKU_PRIVATE_KEY" > /app/.ssh/heroku_private_key

  cat >> /app/.ssh/config <<-EOF

  Host *
    StrictHostKeyChecking no
    IdentityFile /app/.ssh/heroku_private_key
EOF

  chmod 0700 /app/.ssh
  chmod 0600 /app/.ssh/*
fi

# Heroku doesn't support multiple Procfiles in a single project.  We trick it by
# defining the HEROKU_SERVERNAME environment variable in the Config Variables
# section of the dyno and use it thusly:
#
# tools/heroku/$HEROKU_SERVERNAME/
#   * rootdir - symbolic link to where to run |npm install| for this dyno
#   * Procfile - the real Procfile
#
# Unfortunately Heroku is to smart to fall for this trick for the top-level
# app.json file (required for Review Apps), so /app.json must be shared across
# all the Heroku servers
#
if [[ -z $HEROKU_SERVERNAME ]]; then
  echo Error: HEROKU_SERVERNAME environment variable not defined
  exit 1
fi

serverConfigDir=$LOCAL_PATH/$HEROKU_SERVERNAME
if [[ ! -d $serverConfigDir ]]; then
  echo Error: Directory does not exist: $serverConfigDir
  exit 1
fi

set -x
cp -fL $serverConfigDir/Procfile .
cd $serverConfigDir/rootdir/
npm install
