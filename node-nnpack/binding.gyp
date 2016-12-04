{
  'targets': [
    {
      'target_name': 'nnpack',
      'sources': [
        'src/nnpack.cpp'
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<!(echo $NNPACK_ROOT/include)',
        '<!(echo $NNPACK_ROOT/third-party/pthreadpool/include)'
      ],
      'ldflags': [
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
        [ 'OS==\"android\"', {
          'include_dirs': [
            '<!(echo \" -I $ANDROID_BUILD_TOP/external/NNPACK/include \")',
            '<!(echo \" -I $ANDROID_BUILD_TOP/external/pthreadpool/include \")',
          ],
          'libraries': [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
        }],
        ['OS=="win"', {
          'dependencies': [
          ]
        }],
        ['OS=="mac"', {
          'defines': [
          ],
          'include_dirs': [
            '<!(echo $NNPACK_ROOT/include)',
            '<!(echo $NNPACK_ROOT/third-party/pthreadpool/include)'
          ],
          'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'MACOSX_DEPLOYMENT_TARGET': '10.11',
            'OTHER_LDFLAGS': [
              '-L<!(echo "$NNPACK_ROOT/lib")',
              '-lnnpack',
              '<!(echo "$NNPACK_ROOT/third-party/pthreadpool/lib/pthreadpool.c.o")'
            ],
            'OTHER_CFLAGS': [
            ]
          },
          'libraries': [
          ],
        }]
      ]
    }
  ]
}
