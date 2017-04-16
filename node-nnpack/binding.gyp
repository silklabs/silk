{
  'variables' : {
    'NNPACK_ROOT' : '<!(echo ${NNPACK_ROOT:-$(pwd)/NNPACK})',
  },
  'conditions': [
    [ 'OS=="android"', {
      'variables' : {
        'NNPACK_ROOT' : '<!(echo $ANDROID_BUILD_TOP/external/NNPACK)',
      },
    }],
  ],
  'targets': [
    {
      'target_name': 'nnpack',
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
      'defines': [
      ],
      'dependencies': [
      ],
      'conditions': [
        [ 'OS=="android"', {
          'include_dirs': [
            '<!(echo \" -I $ANDROID_BUILD_TOP/external/pthreadpool/include \")',
          ],
          'libraries': [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
        }],
        [ 'OS=="linux"', {
          'ldflags': [
            '-L<(NNPACK_ROOT)/lib',
            '-Wl,-rpath,<(NNPACK_ROOT)/lib:\'$$ORIGIN\'/../../NNPACK/lib',
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
