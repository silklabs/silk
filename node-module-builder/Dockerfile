FROM ubuntu:14.04

# NodeJS install
ENV NODE_VERSION v4.3.2

add http://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz /tmp/node/
run tar -C /tmp/node -zxvf /tmp/node/node* && rm /tmp/node/*.tar.gz
run cp -R -n /tmp/node/*/* /usr/local
run rm -Rf /tmp/node.tar.gz
run node -v

# OpenCV 3 install:
ENV PYTHON_VERSION 2.7
ENV NUM_CORES 4

# Install OpenCV
RUN apt-get -y update
RUN apt-get -y install python$PYTHON_VERSION-dev wget unzip \
                       build-essential cmake git pkg-config libatlas-base-dev gfortran \
                       libjasper-dev libgtk2.0-dev libavcodec-dev libavformat-dev \
                       libswscale-dev libjpeg-dev libpng-dev libtiff-dev libjasper-dev libv4l-dev
RUN wget https://bootstrap.pypa.io/get-pip.py && python get-pip.py
RUN pip install numpy matplotlib

RUN wget https://github.com/Itseez/opencv/archive/3.0.0.zip -O opencv3.zip && \
    unzip -q opencv3.zip && mv /opencv-3.0.0 /opencv
RUN wget https://github.com/Itseez/opencv_contrib/archive/3.0.0.zip -O opencv_contrib3.zip && \
    unzip -q opencv_contrib3.zip && mv /opencv_contrib-3.0.0 /opencv_contrib
RUN mkdir /opencv/build
WORKDIR /opencv/build
RUN cmake -D CMAKE_BUILD_TYPE=RELEASE \
	-D BUILD_PYTHON_SUPPORT=ON \
	-D CMAKE_INSTALL_PREFIX=/usr/local \
	-D INSTALL_C_EXAMPLES=ON \
	-D INSTALL_PYTHON_EXAMPLES=ON \
	-D OPENCV_EXTRA_MODULES_PATH=/opencv_contrib/modules \
	-D BUILD_EXAMPLES=ON \
	-D BUILD_NEW_PYTHON_SUPPORT=ON \
	-D WITH_IPP=OFF \
	-D WITH_V4L=ON ..
RUN make -j$NUM_CORES
RUN make install
RUN ldconfig

# ^ NOTE: Do not edit lines above unless you want to build for 20+ min.

# Install very specific versions of npm and node-gyp globally.
RUN npm install -g npm@3.7.3 node-gyp@3.3.0
ENV BUILDER_USER=builder
ADD builder/src /home/builder/src
RUN adduser --disabled-password --gecos '' $BUILDER_USER && \
    adduser $BUILDER_USER sudo && \
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER builder
WORKDIR /home/builder
RUN sudo mkdir /home/builder/workspace
ENTRYPOINT [ "/home/builder/src/build.sh" ]
