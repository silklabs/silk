{
  'variables' : {
    'NNPACK_ROOT' : '<!(echo ${NNPACK_ROOT:-$(pwd)/NNPACK})',
    'android_ndk%' : '',
    'library_type%': 'loadable_module',
  },
  'conditions': [
    [ 'OS=="android" and android_ndk==""', {
      'variables' : {
        'NNPACK_ROOT' : '<!(echo $ANDROID_BUILD_TOP/external/NNPACK)',
      },
    }],
    [ '"<!(echo ${NNPACK_STATIC})"!="true"', {
      'includes': [
        './copy_libnnpack.gypi',
      ],
    }],
  ],
  'targets': [
    {
      'target_name': 'nnpack',
      'type': '<(library_type)',
      'sources': [
        'src/nnpack.cpp'
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<(NNPACK_ROOT)/include',
        '<(NNPACK_ROOT)/third-party/pthreadpool/include'
      ],
      'cflags_cc': [
        '-std=c++11',
        '-fexceptions',
      ],
      'conditions': [
        [ 'OS=="android" and android_ndk==""', {
          'include_dirs': [
            '<!(echo \" -I $ANDROID_BUILD_TOP/external/pthreadpool/include \")',
          ],
          'libraries': [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
        }],
        [ 'OS=="android" and android_ndk!=""', {
          'libraries': [
            '-lnnpack',
            '-lnnpack_ukernels',
            '-lnnpack_reference',
            '-lpthreadpool',
          ],
        }],
        [ 'OS=="android" and android_ndk != "" and arch=="arm"', {
          'libraries': [
            '-lcpufeatures',
          ],
          'ldflags': [
            '-L<(NNPACK_ROOT)/obj/local/armeabi-v7a',
          ],
        }],
        [ 'OS=="android" and android_ndk != "" and arch=="arm64"', {
          'ldflags': [
            '-L<(NNPACK_ROOT)/obj/local/arm64-v8a',
          ],
        }],
        [ 'OS=="linux"', {
          'ldflags': [
            '-L<(NNPACK_ROOT)/lib',
            '-Wl,-rpath,\'$$ORIGIN\'',
          ],
          'libraries': [
            '-lnnpack',
          ],
        }],
        ['OS=="mac"', {
          'defines': [
          ],
          'include_dirs': [
            '<(NNPACK_ROOT)/include',
            '<(NNPACK_ROOT)/third-party/pthreadpool/include'
          ],
          'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'MACOSX_DEPLOYMENT_TARGET': '10.11',
            'OTHER_LDFLAGS': [
              '-L<(NNPACK_ROOT)/lib',
              '-lnnpack',
              '<(NNPACK_ROOT)/third-party/pthreadpool/lib/pthreadpool.c.o'
            ],
            'OTHER_CFLAGS': [
            ]
          },
          'libraries': [
          ],
        }]
      ]
    },
  ]
}
