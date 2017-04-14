FROM nvidia/cuda:8.0-cudnn5-devel-ubuntu14.04

MAINTAINER mvine@silklabs.com

RUN apt-get update -qq && \
    apt-get install -y software-properties-common python-software-properties && \
    add-apt-repository -y ppa:george-edison55/cmake-3.x && \
    add-apt-repository -y ppa:git-core/ppa && \
    add-apt-repository -y ppa:kubuntu-ppa/backports && \
    add-apt-repository -y ppa:phablet-team/tools && \
    add-apt-repository -y ppa:ubuntu-toolchain-r/ppa && \
    add-apt-repository -y ppa:amarburg/opencv3 && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive \
      apt-get install -y \
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

# Install node v6.9.1
RUN wget https://nodejs.org/dist/v6.9.1/node-v6.9.1-linux-x64.tar.gz && \
    tar -xv -C /usr/local --strip-components 1 -f node-v6.9.1-linux-x64.tar.gz && \
    rm node-v6.9.1-linux-x64.tar.gz

ENV JAVA_HOME /usr
RUN echo 'PATH=$PATH:HOME/bin:$JAVA_HOME/bin' >> /etc/profile && \
    echo 'export JAVA_HOME' >> /etc/profile && \
    echo 'export PATH' >> /etc/profile && \
    addgroup silk && \
    adduser -ingroup silk --gecos "" --disabled-password silk && \
    echo 'silk ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/silk && \
    echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="silk"' >> /etc/udev/rules.d/51-android.rules && \
    echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="1004", MODE="0666", GROUP="silk"' >> /etc/udev/rules.d/51-android.rules && \
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

