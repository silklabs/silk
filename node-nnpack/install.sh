#!/bin/bash -ex

rm -rf NNPACK
git clone --recursive git@github.com:silklabs/NNPACK.git
cd NNPACK/

virtualenv env
source env/bin/activate
pip install ninja-syntax

git clone https://github.com/Maratyszcza/PeachPy.git
(
  cd PeachPy
  pip install --upgrade -r requirements.txt
  python setup.py generate
  pip install --upgrade .
)

python ./configure.py --enable-shared
ninja
