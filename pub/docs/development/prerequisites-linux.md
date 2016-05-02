# Prerequisites (Linux)

**Below is the list of prerequisites for building Silk on Linux.**
These instructions have only been tested on Ubuntu 14.04 LTS and Ubuntu 16.04 LTS.

Right now, our work is based on Node v4.2.x, and NPM 2.x. If you don't have those, follow the guide below:

```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 4.2.6
```

If you are running Ubuntu 16.04 LTS, the openjdk-7-jdk package has been removed so run the following to bring it back:
```bash
lsb_release -d  # Only run if this outputs "Ubuntu 16.04 LTS"
sudo add-apt-repository ppa:openjdk-r/ppa  
sudo apt-get update   
```

Then install the following packages:
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
```

and configure your ccache:
```bash
ccache -M 5GB     # <--- Use 10GB if you can afford it though
```

Once you're done, continue to the [building instructions](build-instructions-linux-osx.md).
