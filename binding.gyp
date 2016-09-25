{
  'targets': [
    {
      'target_name': 'qsml',
      'sources': [
        'src/qsml.cpp',
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<!(echo $QSML_ROOT)/include',
      ],
      'ldflags': [
        '-Wl,-rpath,<!(echo $QSML_ROOT)/lib',
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
            '<!(echo \" -I $ANDROID_BUILD_TOP/external/qualcomm-developer-network/qsml-0.15.0/lp64/arm-linux-androideabi/include \")',
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
          ],
          'libraries': [
            '-L<!(echo $QSML_ROOT)/lib',
            '-lQSML'
          ],
          'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'MACOSX_DEPLOYMENT_TARGET': '10.11',
            'OTHER_LDFLAGS': [
              '-Wl,-rpath,<!(echo $QSML_ROOT)/lib',
            ],
            'OTHER_CFLAGS': [
            ]
          },
          'postbuilds': [
            {
              'postbuild_name': 'Make libQSML relative to rpath.',
              'action': [
                'install_name_tool',
                '-change',
                'libQSML.0.dylib',
                '@rpath/libQSML.0.dylib',
                '<@(PRODUCT_DIR)/qsml.node'
              ]
            },
          ]
        }]
      ]
    }
  ]
}