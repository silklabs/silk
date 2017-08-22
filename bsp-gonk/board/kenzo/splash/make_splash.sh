#!/bin/bash -ex

if [ ! -d android_device_qcom_splashtool ]; then
  git clone https://github.com/mvines/android_device_qcom_splashtool.git
fi
(
  cd android_device_qcom_splashtool/
  virtualenv .
  . bin/activate
  pip install pillow
  python splash_gen.py ../splash.png ../splash.img
)
ls -l splash.img
