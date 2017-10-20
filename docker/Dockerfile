FROM nvidia/cuda:8.0-cudnn5-devel-ubuntu14.04

LABEL maintainer mvines@silklabs.com

RUN addgroup --gid 999 docker && \
    apt-get update -qq && \
    apt-get install -y \
      apt-transport-https \
      curl \
      python-software-properties \
      software-properties-common && \
    add-apt-repository -y ppa:amarburg/opencv3 && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    add-apt-repository -y ppa:george-edison55/cmake-3.x && \
    add-apt-repository -y ppa:git-core/ppa && \
    add-apt-repository -y ppa:kubuntu-ppa/backports && \
    add-apt-repository -y ppa:mc3man/trusty-media && \
    add-apt-repository -y ppa:phablet-team/tools && \
    add-apt-repository -y ppa:ubuntu-toolchain-r/ppa && \
    add-apt-repository -y ppa:ubuntu-toolchain-r/test && \
    add-apt-repository "deb https://cli-assets.heroku.com/branches/stable/apt ./" && \
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu trusty stable" && \
    curl -L https://cli-assets.heroku.com/apt/release.key | apt-key add - && \
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add - && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv EA312927 && \
    echo "deb http://repo.mongodb.org/apt/ubuntu trusty/mongodb-org/3.2 multiverse" > /etc/apt/sources.list.d/mongodb-org-3.2.list && \
    apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 32A37959C2FA5C3C99EFBC32A79206696452D198 && \
    echo "deb https://apt.buildkite.com/buildkite-agent stable main" > /etc/apt/sources.list.d/buildkite-agent.list && \
    echo "deb [arch=amd64] https://packages.microsoft.com/repos/azure-cli/ wheezy main" > /etc/apt/sources.list.d/azure-cli.list && \
    apt-key adv --keyserver packages.microsoft.com --recv-keys 417A0893  && \
    apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive \
      apt-get install -y \
        apt-file \
        autoconf \
        azure-cli \
        bc \
        build-essential \
        buildkite-agent \
        bsdmainutils \
        cabal-install \
        ccache \
        chrpath \
        cmake \
        diffstat \
        docker-ce \
        dos2unix \
        fonts-freefont-ttf \
        g++ \
        g++-4.8 \
        g++-4.8-multilib \
        g++-5 \
        gawk \
        gettext \
        gfortran \
        git \
        gnuplot \
        heroku \
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
        libusb-1.0-0-dev \
        libxml2-utils \
        linux-libc-dev  \
        m4 \
        mkisofs \
        mongodb-org \
        mongodb-org-mongos \
        mongodb-org-server \
        mongodb-org-shell \
        mongodb-org-tools \
        openjdk-7-jre \
        openjdk-7-jdk \
        openssh-server \
        pkg-config \
        protobuf-compiler \
        psmisc \
        python-dev \
        python-pip \
        python-virtualenv \
        python3.5 \
        rsync \
        silversearcher-ag \
        texinfo \
        unzip \
        vim \
        x11-utils \
        xbase-clients \
        vnc4server \
        wget \
        xmlstarlet \
        zip \
        ffmpeg && \
    wget https://download.docker.com/linux/ubuntu/dists/trusty/pool/edge/amd64/docker-ce_17.05.0~ce-0~ubuntu-trusty_amd64.deb && \
    sudo dpkg -i docker-ce_17.05.0~ce-0~ubuntu-trusty_amd64.deb && \
    rm -f docker-ce_17.05.0~ce-0~ubuntu-trusty_amd64.deb && \
    rm -rf /var/lib/apt/lists/*


# JDK 1.8
RUN wget http://archive.ubuntu.com/ubuntu/pool/universe/o/openjdk-8/openjdk-8-jre-headless_8u45-b14-1_amd64.deb && \
    wget http://archive.ubuntu.com/ubuntu/pool/universe/o/openjdk-8/openjdk-8-jre_8u45-b14-1_amd64.deb && \
    wget http://archive.ubuntu.com/ubuntu/pool/universe/o/openjdk-8/openjdk-8-jdk_8u45-b14-1_amd64.deb && \
    sudo apt-get update -qq && \
    sudo dpkg -i *.deb && \
    rm *.deb

# Build/install Shellcheck (bash linter)
RUN cabal update && \
    git clone https://github.com/koalaman/shellcheck.git && \
    git -C shellcheck checkout 6c068e7d29a835139517fa7345d9d450ef57b170 && \
    cd shellcheck && \
    cabal install && \
    sudo cp ~/.cabal/bin/shellcheck /usr/bin && \
    cd .. && \
    rm -rf shellcheck

# Build/install opencv3
RUN wget https://github.com/Itseez/opencv_contrib/archive/3.0.0.zip -O opencv_contrib3.zip && \
    unzip -q opencv_contrib3.zip && \
    mv opencv_contrib-3.0.0 opencv_contrib && \
    git clone --branch '3.1.0' https://github.com/opencv/opencv.git && \
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
      -D OPENCV_EXTRA_MODULES_PATH=../../opencv_contrib/modules \
      -DBUILD_opencv_optflow=OFF \
      -DBUILD_opencv_ximgproc=OFF \
      -DBUILD_opencv_xfeatures2d=OFF \
      .. && \
    make -j$(nproc) install && \
    cd ../.. && \
    rm -rf opencv

# Install node v6.10.3
RUN wget -q https://nodejs.org/dist/v6.10.3/node-v6.10.3-linux-x64.tar.gz && \
    tar -x -C /usr/local --strip-components 1 -f node-v6.10.3-linux-x64.tar.gz && \
    rm node-v6.10.3-linux-x64.tar.gz

# Useful npm packages
RUN npm install -g mvines/relay

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

# Platform tools
RUN wget -q https://dl-ssl.google.com/android/repository/platform-tools_r23-linux.zip && \
    unzip platform-tools_r23-linux.zip \
          platform-tools/adb platform-tools/fastboot && \
    cp platform-tools/* /usr/bin/ && \
    rm -rf platform-tools*

ENV JAVA_HOME /usr
RUN echo 'PATH=$PATH:HOME/bin:$JAVA_HOME/bin' >> /etc/profile && \
    echo 'export JAVA_HOME' >> /etc/profile && \
    echo 'export PATH' >> /etc/profile && \
    update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-5 20 && \
    update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-4.8 10 && \
    update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-5 20 && \
    update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-4.8 10 && \
    addgroup silk --gid 1000 && \
    addgroup adbuser --gid 1002 && \
    adduser --uid 1000 --ingroup silk --gecos "" --disabled-password silk && \
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

RUN mkdir -p /opt/conda && \
    chown silk:users /opt/conda && \
    chmod g+w /opt/conda

USER silk

# Install minicoda and Python 3.6
RUN cd ~ && \
    wget --quiet https://repo.continuum.io/miniconda/Miniconda3-4.3.21-Linux-x86_64.sh -O ~/miniconda.sh && \
    /bin/bash ~/miniconda.sh -b -f -p /opt/conda && \
    rm ~/miniconda.sh

# Install TensorFlow GPU version in its own env
RUN cd ~ && \
    /opt/conda/bin/conda create -v --name tensorflow_gpu python=3.6 && \
    /bin/bash -c " \
      source /opt/conda/bin/activate tensorflow_gpu; \
      # Dependencies required for tensorflow
      pip install pylint==1.7.1; \
      pip install pytz; \
      pip install https://storage.googleapis.com/tensorflow/linux/gpu/tensorflow_gpu-1.2.0-cp36-cp36m-linux_x86_64.whl; \
      source deactivate tensorflow_gpu\
    "

# Install TensorFlow CPU version in its own env
RUN cd ~ && \
    /opt/conda/bin/conda create -v --name tensorflow_cpu python=3.6 && \
    /bin/bash -c " \
      source /opt/conda/bin/activate tensorflow_cpu; \
      # Dependencies required for tensorflow
      pip install pylint==1.7.1; \
      pip install pytz; \
      pip install https://storage.googleapis.com/tensorflow/linux/cpu/tensorflow-1.2.0-cp36-cp36m-linux_x86_64.whl; \
      source deactivate tensorflow_cpu\
    "

RUN sudo chown -R silk:users /opt/conda && \
  sudo chmod -R g+w /opt/conda

RUN ccache -M 10GB && \
    git config --global user.email "silkysmooth@example.com" && \
    git config --global user.name "Silky Smooth" && \
    git config --global color.ui true && \
    ssh-keygen -q -N "" -t rsa -f /home/silk/.ssh/id_rsa && \
    ssh-keyscan -H localhost >> ~/.ssh/known_hosts && \
    ssh-keyscan -H github.com >> ~/.ssh/known_hosts && \
    cp /home/silk/.ssh/id_rsa.pub /home/silk/.ssh/authorized_keys
