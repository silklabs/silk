{
  'targets': [{
      'target_name': 'caffe',
      'sources': [
          'src/caffe.cpp',
          'src/model.cpp',
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<!(echo \" -I $ANDROID_BUILD_TOP/external/node-opencv/inc \")',
      ],
      'cflags_cc': [
        '-fexceptions',
        '-frtti',
      ],
      'cflags': [
        '-std=c++11',
        '-DBUILD_python=OFF',
        '-DBUILD_docs=OFF',
        '-DCPU_ONLY=ON',
        '-DUSE_GLOG=OFF',
        '-DUSE_LMDB=OFF',
        '-DUSE_LEVELDB=OFF',
        '-DUSE_HDF5=OFF',
        '-Wno-sign-compare',
        '-Wstrict-aliasing',
        '-isystem <!(echo $ANDROID_BUILD_TOP/system/core/include/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/$TARGET_OUT_HEADERS/libgflags/include/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/$TARGET_OUT_HEADERS/libopenblas/include)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/external/protobuf/src)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/external/boost/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/external/caffe/src/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/external/caffe/include/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/external/caffe/include/ceres/internal/miniglog/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/$TARGET_OUT_HEADERS/libopencv2_core/include/)',
        '-isystem <!(echo $ANDROID_BUILD_TOP/external/dlib/)',
      ],
      'ldflags': [
        '-Wl,--no-fatal-warnings',
      ],
      "libraries": [
        '<!(echo $Android_mk__LIBRARIES)',
      ],
    },
  ],
}
