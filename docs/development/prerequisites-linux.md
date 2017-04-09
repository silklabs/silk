# Prerequisites (Linux)

**Below is the list of prerequisites for building Silk on Linux.**
These instructions have only been tested on *Ubuntu 14.04 LTS*. (Ubuntu 16.04 LTS is known not to work for most device builds.)

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 6.9.1
```

cmake 3.x is required, add a PPA for it since Ubuntu 14.04 doesn't have it out of the box:
```
sudo add-apt-repository ppa:george-edison55/cmake-3.x
sudo apt-get update
```

Then install the following packages:
```bash
sudo apt-get install -y \
  android-tools-adb \
  android-tools-fastboot \
  apt-file \
  autoconf \
  bc \
  ccache \
  chrpath \
  cmake \
  diffstat \
  g++ \
  g++-4.8 \
  g++-4.8-multilib \
  gawk \
  git \
  jq \
  lib32stdc++6 \
  lib32z1 \
  libatlas-base-dev \
  libc6-dev \
  libc6-dev-i386 \
  libopencv3-dev \
  libtool \
  libxml2-utils \
  linux-libc-dev  \
  m4 \
  mkisofs \
  openjdk-7-jdk \
  openssh-server \
  texinfo \
  xmlstarlet \
  zip
```

and configure your ccache:
```bash
ccache -M 10GB
```

Once you're done, continue to the [building instructions](build-instructions-linux-osx.md).
