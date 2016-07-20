{
  'targets': [{
      'target_name': 'webrtc_vad',
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
      ],
      'cflags!' : [ '-fno-exceptions'],
      'cflags_cc!': [ '-fno-rtti',  '-fno-exceptions'],
      'conditions': [
        [ 'OS==\"android\"', {
          'sources': [
            'src/vad_bindings.cpp',
            'src/vad.cpp',
          ],
          'include_dirs': [
            '<!(echo $ANDROID_BUILD_TOP/system/core/include)',
            '<!(echo $ANDROID_BUILD_TOP/external/silk-webrtc)',
            '<!(echo $ANDROID_BUILD_TOP/external/silk-webrtc/webrtc/common_audio)',
          ],
          'libraries': [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
          'cflags': [
            '-Wall',
            '-Wstrict-aliasing',
          ],
        }],
      ],
    },
  ],
}
