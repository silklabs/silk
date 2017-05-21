FROM nvidia/cuda:8.0-cudnn5-devel-ubuntu14.04

LABEL maintainer mvine@silklabs.com

RUN apt-get update -qq && \
    apt-get install -y \
      apt-transport-https \
      python-software-properties \
      software-properties-common && \
    add-apt-repository -y ppa:amarburg/opencv3 && \
    add-apt-repository -y ppa:george-edison55/cmake-3.x && \
    add-apt-repository -y ppa:git-core/ppa && \
    add-apt-repository -y ppa:kubuntu-ppa/backports && \
    add-apt-repository -y ppa:phablet-team/tools && \
    add-apt-repository -y ppa:ubuntu-toolchain-r/ppa && \
    add-apt-repository -y ppa:ubuntu-toolchain-r/test && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv EA312927 && \
    echo "deb http://repo.mongodb.org/apt/ubuntu trusty/mongodb-org/3.2 multiverse" > /etc/apt/sources.list.d/mongodb-org-3.2.list && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 32A37959C2FA5C3C99EFBC32A79206696452D198 && \
    echo "deb https://apt.buildkite.com/buildkite-agent stable main" > /etc/apt/sources.list.d/buildkite-agent.list && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive \
      apt-get install -y \
        android-tools-adb \
        android-tools-fastboot \
        apt-file \
        autoconf \
        bc \
        build-essential \
        buildkite-agent \
        bsdmainutils \
        ccache \
        chrpath \
        cmake \
        curl \
        diffstat \
        dos2unix \
        fonts-freefont-ttf \
        g++ \
        g++-4.8 \
        g++-4.8-multilib \
        g++-5 \
        gawk \
        gfortran \
        git \
        gnuplot \
        jq \
        lib32stdc++6 \
        lib32z1 \
        libatlas-base-dev \
        libboost-all-dev \
        libc6-dev \
        libc6-dev-i386 \
        libfreetype6-dev \
        libgflags-dev \
        libgoogle-glog-dev \
        libhdf5-serial-dev \
        libleveldb-dev \
        liblmdb-dev \
        libpng12-dev \
        libprotobuf-dev \
        libsnappy-dev \
        libtool \
        libxml2-utils \
        linux-libc-dev  \
        m4 \
        mkisofs \
        mongodb-org \
        mplayer \
        mongodb-org-server \
        mongodb-org-shell \
        mongodb-org-mongos \
        mongodb-org-tools \
        openjdk-7-jdk \
        openssh-server \
        pkg-config \
        protobuf-compiler \
        python-dev \
        python-pip \
        python-virtualenv \
        rsync \
        texinfo \
        unzip \
        vim \
        wget \
        xmlstarlet \
        zip && \
    rm -rf /var/lib/apt/lists/*

# Build/install opencv3
RUN git clone --branch '3.1.0' https://github.com/opencv/opencv.git && \
  cd opencv && \
  mkdir build && \
  cd build && \
  cmake -Wno-dev \
    -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    -DBUILD_TESTS=false \
    -DWITH_TIFF=false \
    -DWITH_CUDA=false \
    -DBUILD_ANDROID_EXAMPLES=false \
    -DWITH_OPENEXR=false \
    -DBUILD_PERF_TESTS=false \
    -DBUILD_opencv_java=false \
    -DWITH_IPP=OFF \
    -DCMAKE_INSTALL_PREFIX=/usr/ \
    .. && \
  make -j$(nproc) install && \
  cd ../.. && \
  rm -rf opencv

# Install node v6.9.1
RUN wget -q https://nodejs.org/dist/v6.9.1/node-v6.9.1-linux-x64.tar.gz && \
    tar -x -C /usr/local --strip-components 1 -f node-v6.9.1-linux-x64.tar.gz && \
    rm node-v6.9.1-linux-x64.tar.gz

# Install ninja
RUN wget -q https://github.com/ninja-build/ninja/releases/download/v1.7.2/ninja-linux.zip && \
    unzip ninja-linux.zip && \
    rm ninja-linux.zip  && \
    mv ninja /usr/bin && \
    chmod +x /usr/bin/ninja && \
    pip install ninja-syntax

# Install python packages
RUN pip install --upgrade pip && \
    pip install matplotlib numpy scipy

ENV JAVA_HOME /usr
RUN echo 'PATH=$PATH:HOME/bin:$JAVA_HOME/bin' >> /etc/profile && \
    echo 'export JAVA_HOME' >> /etc/profile && \
    echo 'export PATH' >> /etc/profile && \
    update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-5 20 && \
    update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.8 10 && \
    update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-5 20 && \
    update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.8 10 && \
    addgroup silk && \
    addgroup adbuser && \
    adduser -ingroup silk --gecos "" --disabled-password silk && \
    adduser silk audio && \
    adduser silk adbuser && \
    echo 'silk ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/silk && \
    echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="adbuser"' >> /etc/udev/rules.d/51-android.rules && \
    echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="1004", MODE="0666", GROUP="adbuser"' >> /etc/udev/rules.d/51-android.rules && \
    sed 's#session\s*required\s*pam_loginuid.so#session optional pam_loginuid.so#g' -i /etc/pam.d/sshd && \
    udevadm trigger && \
    rm -rf /etc/ssh/ssh_host_dsa_key /etc/ssh/ssh_host_rsa_key && \
    ssh-keygen -q -N "" -t dsa -f /etc/ssh/ssh_host_dsa_key && \
    ssh-keygen -q -N "" -t rsa -f /etc/ssh/ssh_host_rsa_key

USER silk
RUN ccache -M 10GB && \
    git config --global user.email "silkysmooth@example.com" && \
    git config --global user.name "Silky Smooth" && \
    git config --global color.ui true && \
    ssh-keygen -q -N "" -t rsa -f /home/silk/.ssh/id_rsa && \
    ssh-keyscan -H localhost >> ~/.ssh/known_hosts && \
    ssh-keyscan -H github.com >> ~/.ssh/known_hosts && \
    cp /home/silk/.ssh/id_rsa.pub /home/silk/.ssh/authorized_keys
