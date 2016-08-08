# Ubuntu 14.04 with opencv and node opencv@3.2.0
FROM borromeotlhs/node-opencv

MAINTAINER borromeotlhs@gmail.com

RUN apt-get update
# these are problem packages that weren't registering along with the rest
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y android-tools-adb
RUN add-apt-repository ppa:git-core/ppa
RUN add-apt-repository ppa:phablet-team/tools
RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y \
openssh-server \
git \
#openjdk-7-jdk \
m4 \
libxml2-utils \
ccache \
cmake \
lib32z1 \
lib32stdc++6 \
libc6-dev-i386 \
linux-libc-dev \
g++ \
android-tools-adb \
android-tools-fastboot \
apt-file

RUN apt-file update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y \
lib32stdc++6
#libstdc++6:i386

# may need to update this for 10GB later
RUN ccache -M 6GB

RUN addgroup silk
RUN adduser -ingroup silk --gecos "" --disabled-password silk

RUN echo 'PATH=$PATH:HOME/bin:$JAVA_HOME/bin' >> /etc/profile &&\
    echo 'export JAVA_HOME' >> /etc/profile &&\
    echo 'export PATH' >> /etc/profile

RUN rm -rf /etc/ssh/ssh_host_dsa_key /etc/ssh/ssh_host_rsa_key
RUN ssh-keygen -q -N "" -t dsa -f /etc/ssh/ssh_host_dsa_key
RUN ssh-keygen -q -N "" -t rsa -f /etc/ssh/ssh_host_rsa_key

USER silk

RUN ssh-keygen -q -N "" -t rsa -f /home/silk/.ssh/id_rsa
RUN cp /home/silk/.ssh/id_rsa.pub /home/silk/.ssh/authorized_keys
# add localhost to silks's list of known_hosts files without need ssh login
RUN ssh-keyscan -H localhost >> ~/.ssh/known_hosts

USER root

# SSH login fix so user isn't kicked after login
RUN sed 's#session\s*required\s*pam_loginuid.so#session optional pam_loginuid.so#g' -i /etc/pam.d/sshd

COPY ./51-android.rules /etc/udev/rules.d/51-android.rules
RUN udevadm trigger

ENV JAVA_HOME /usr

RUN DEBIAN_FRONTEND=noninteractive apt-get install -y \
openjdk-7-jdk