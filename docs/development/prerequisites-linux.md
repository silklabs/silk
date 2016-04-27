# Prerequisites (Linux)

**Below is the list of prerequisites for building Silk on Linux.**

Right now, our work is based on Node v4.2.x, and NPM 2.x. If you don't have those, follow the guide below:

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.26.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 4.2.6
```
For the dependencies to successfully building, those are what you will need.

```bash
sudo apt-get install -y \
  openjdk-7-jdk \
  m4 \
  libxml2-utils \
  ccache \
  cmake \
  android-tools-adb \
  lib32z1 \
  lib32stdc++6 \
  libc6-dev-i386 \
  libstdc++6:i386  \
  linux-libc-dev  \
  g++ \
  g++-4.8 \
  g++-4.8-multilib \
  libcv-dev \
  libcvaux-dev \
  libhighgui-dev \
  libopencv-dev

ccache -M 5GB     # <--- Use 10GB if you can afford it though
```

Once you're done, continue to the [building instructions](build-instructions-linux-osx.md).
