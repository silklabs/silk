# Prerequisites (Linux)

**Below is the list of prerequisites for building Silk on Linux.**
These instructions have only been tested on *Ubuntu 14.04 LTS*. (Ubuntu 16.04 LTS is known not to work for most device builds.)

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 6.10.3
```

cmake 3.x is required, add a PPA for it since Ubuntu 14.04 doesn't have it out of the box:
```
sudo add-apt-repository ppa:george-edison55/cmake-3.x
sudo apt-get update
```

Add the gcc 5 PPA:
```
sudo add-apt-repository -y ppa:ubuntu-toolchain-r/test
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
  g++-5 \
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
  python-pip \
  python-virtualenv \
  texinfo \
  xmlstarlet \
  zip
```

and configure your ccache:
```bash
ccache -M 10GB
```

then select gcc 5 as the default host compiler:
```bash
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-5 20
sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.8 10
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-5 20
sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.8 10
sudo update-alternatives --display gcc
sudo update-alternatives --display g++
```

also install ninja:
```bash
wget https://github.com/ninja-build/ninja/releases/download/v1.7.2/ninja-linux.zip
unzip ninja-linux.zip
sudo cp ninja /usr/bin
sudo chmod +x /usr/bin/ninja
rm ninja-linux.zip ninja
```

Once you're done, continue to the [building instructions](build-instructions-linux-osx.md).
