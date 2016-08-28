# Ubuntu 14.04 with opencv and node opencv@3.2.0
FROM borromeotlhs/node-opencv

MAINTAINER borromeotlhs@gmail.com

RUN add-apt-repository ppa:george-edison55/cmake-3.x
RUN add-apt-repository ppa:git-core/ppa
RUN add-apt-repository ppa:kubuntu-ppa/backports 
RUN add-apt-repository ppa:phablet-team/tools
RUN add-apt-repository ppa:ubuntu-toolchain-r/ppa
RUN apt-get update

ENV JAVA_HOME /usr
RUN echo 'PATH=$PATH:HOME/bin:$JAVA_HOME/bin' >> /etc/profile &&\
    echo 'export JAVA_HOME' >> /etc/profile &&\
    echo 'export PATH' >> /etc/profile

RUN DEBIAN_FRONTEND=noninteractive apt-get install -y \
  android-tools-adb \
  android-tools-fastboot \
  apt-file \
  ccache \
  cmake \
  g++ \
  g++-4.8 \
  git \
  lib32stdc++6 \
  lib32z1 \
  libc6-dev-i386 \
  libcv-dev \
  libcvaux-dev \
  libhighgui-dev \
  libopencv-dev \
  libxml2-utils \
  linux-libc-dev  \
  m4 \
  mkisofs \
  openjdk-7-jdk \
  openssh-server \
  zip

RUN DEBIAN_FRONTEND=noninteractive apt-get remove -y nodejs

USER root
# SSH login fix so user isn't kicked after login
RUN sed 's#session\s*required\s*pam_loginuid.so#session optional pam_loginuid.so#g' -i /etc/pam.d/sshd
COPY ./51-android.rules /etc/udev/rules.d/51-android.rules
RUN udevadm trigger

RUN rm -rf /etc/ssh/ssh_host_dsa_key /etc/ssh/ssh_host_rsa_key
RUN ssh-keygen -q -N "" -t dsa -f /etc/ssh/ssh_host_dsa_key
RUN ssh-keygen -q -N "" -t rsa -f /etc/ssh/ssh_host_rsa_key

RUN addgroup silk
RUN adduser -ingroup silk --gecos "" --disabled-password silk
COPY sudoers_silk /etc/sudoers.d/silk

USER silk
RUN ccache -M 6GB

RUN ssh-keygen -q -N "" -t rsa -f /home/silk/.ssh/id_rsa
RUN cp /home/silk/.ssh/id_rsa.pub /home/silk/.ssh/authorized_keys
# add localhost to silk's list of known_hosts files without need ssh login
RUN ssh-keyscan -H localhost >> ~/.ssh/known_hosts

# add github to the list of know hosts
RUN ssh-keyscan -H github.com >> ~/.ssh/known_hosts

# Setup git
RUN git config --global user.email "silkysmooth@example.com"
RUN git config --global user.name "Silky Smooth"
RUN git config --global color.ui true

# Install node 6
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
RUN bash -i -c 'nvm install 6'
ENV NVM_DIR /home/silk/.nvm
