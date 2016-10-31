# Dockerfile for silk development

Example:
```
$ docker build -t silklabs/silk .
$ docker run -i -t -u silk silklabs/silk
-- now in docker --
$ cd
$ git clone https://github.com/silklabs/silk.git
$ cd silk/bsp-gonk
$ ./sync kenzo
$ source build/envsetup.sh
$ make -j8
```

https://hub.docker.com/r/silklabs/silk/
