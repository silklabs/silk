# Dockerfile for silk development

Example:
```
$ docker build -t silkdev .
$ docker run -i -t -u silk silkdev
-- now in docker --
$ cd
$ git clone https://github.com/silklabs/silk.git
$ cd silk/bsp-gonk
$ ./sync kenzo
$ source build/envsetup.sh
$ make -j8
```
