#!/bin/bash

sleep 30

export DOCKER_OPTS='-g /mnt'

mkdir -p /etc/apt/apt.conf.d/
cp /tmp/local /etc/apt/apt.conf.d/
cp /tmp/docker /etc/default/docker
curl -sSL https://get.docker.com/ | sh
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-ci-multi-runner/script.deb.sh | bash
apt-get install gitlab-ci-multi-runner
apt-get upgrade -y
cp /tmp/gitlab-register.conf /etc/init/gitlab-register.conf
cp /tmp/gitlab-unregister.conf /etc/init/gitlab-unregister.conf
cp -R /tmp/ssh /var/ssh
chmod 0644 /var/ssh/id_rsa
