{
  'variables': {
    'configuration%': 'Release',
    # This is normally added by node-gyp but we need to manually specify it
    # since we are using chromium gyp...
    'node_root_dir%': '/usr/local',
    'node_webrtc_root_dir%': './',
    'nodewebrtc_js_dest%': 'build',
    'module_name': 'node-webrtc',
    '_target_name': 'node-webrtc',
    'module_path': 'build/',
    'standalone_static_library': '1',
  },
  'targets': [
    {
      'target_name': 'node-webrtc',
      'product_extension': 'node',
      'product_prefix': '',
      'type': 'shared_library',
      'variables': {
        # Due to gyp magic the paths we use to include other .gyp files may be
        # different than the absolute path to the project so we need this var.
        'nodewebrtc_gyp_webrtc_root%': '<(DEPTH)/webrtc',
        # Absolute path to the webrtc root (silk-webrtc)
        'nodewebrtc_webrtc_root%': '<(DEPTH)',
        'libwebrtc_out%': '<(DEPTH)/out/$(BUILDTYPE)/obj',
      },
      'sources': [
        'src/Platform.cc',
        'src/Global.cc',
        'src/BackTrace.cc',
        'src/EventEmitter.cc',
        'src/Observers.cc',
        'src/Module.cc',
        'src/PeerConnection.cc',
        'src/DataChannel.cc',
        'src/GetSources.cc',
        'src/GetUserMedia.cc',
        'src/MediaStream.cc',
        'src/MediaStreamTrack.cc',
        'src/MediaConstraints.cc',
        'src/Stats.cc',
      ],
      'aosp_build_settings': {
        # We need to explicitly munge the path and suffix here since we do not
        # have any tooling from node-gyp.
        'LOCAL_INSTALLED_MODULE_STEM': '../silk/node_modules/node-webrtc/build/Release/node-webrtc.node',
        'LOCAL_MODULE_SUFFIX': '.node'
      },
      'dependencies': [
        '<(nodewebrtc_gyp_webrtc_root)/webrtc.gyp:webrtc',
        '<(nodewebrtc_gyp_webrtc_root)/api/api.gyp:*',
        '<(nodewebrtc_gyp_webrtc_root)/system_wrappers/system_wrappers.gyp:field_trial_default',
      ],
      'include_dirs': [
        "<(nodewebrtc_webrtc_root)/third_party/jsoncpp/source/include",
        '<(node_root_dir)/include/node',
        '<(node_root_dir)/src',
        '<(node_root_dir)/deps/uv/include',
        '<(node_root_dir)/deps/v8/include',
        '<(node_webrtc_root_dir)/node_modules/nan',
      ],
      'link_settings': {
        'conditions': [
          ['OS=="android"', {
            'libraries': [
              'libcutils.so',
            ],
            'ldflags': [
              '-Wl,--unresolved-symbols=ignore-all',
            ]
          }]
        ],
      },
      'defines': [
        # We do not use node-gyp so we need to define this ourselves...
        'NODE_GYP_MODULE_NAME=node-webrtc',
        'BUILDING_NODE_EXTENSION',
        'TRACING',
        'LARGEFILE_SOURCE',
        '_FILE_OFFSET_BITS=64',
        'WEBRTC_TARGET_PC',
        'WEBRTC_LINUX',
        'WEBRTC_THREAD_RR',
        'EXPAT_RELATIVE_PATH',
        'GTEST_RELATIVE_PATH',
        'JSONCPP_RELATIVE_PATH',
        'WEBRTC_RELATIVE_PATH',
        'POSIX',
        '__STDC_FORMAT_MACROS',
        'DYNAMIC_ANNOTATIONS_ENABLED=0',
        'WEBRTC_POSIX=1'
      ],
      'conditions': [
        ['OS=="android"', {
          'include_dirs': [
            '<(android_build_top)/system/core/include',
          ],
          'sources': [
            'src/GonkVideoEncoderFactory.cc',
            'src/GonkVideoEncoder.cc',
          ],
          'actions': [{
            'action_name': 'buildjs',
            'inputs': [],
            'outputs': [
              '<(nodewebrtc_js_dest)/index.js',
              '<(nodewebrtc_js_dest)/package.json'
            ],
            'action': [
              '/bin/bash',
              '-c',
              'BABEL_CACHE=0 ../pub/buildjs/bin/build <(node_webrtc_root_dir) <(nodewebrtc_js_dest) --no-native',
            ]
          }]
        }],
        ['OS=="linux"', {
          'cflags': [
            '-Wno-deprecated-declarations',
            '-Wno-unused-variable',
            '-Wno-unknown-pragmas',
            '-Wno-unused-result',
          ],
          'cflags_cc': [
            '-Wno-non-virtual-dtor',
            '-Wno-delete-non-virtual-dtor',
            '-Wno-overloaded-virtual',
          ],
          'ldflags': [
            '-Wl,--unresolved-symbols=ignore-in-object-files',
          ],
          'defines': [
            'USE_BACKTRACE',
          ],
        }],
        ['OS=="win"', {
          'msvs_disabled_warnings': [
            4267,
            4005,
            4201,
            4506,
          ],
        }],
        ['OS=="mac"', {
          'xcode_settings': {
            'OTHER_LDFLAGS': [
               '-undefined dynamic_lookup'
            ],
            'OTHER_CFLAGS': [
              '-Wno-nonnull',
              '-Wno-deprecated-declarations',
              '-Wno-newline-eof',
              '-Wno-unknown-pragmas',
              '-Wno-unused-result',
              '-Wno-c++0x-extensions',
              '-Wno-c++11-extensions',
              '-Wno-error',
            ],
          },
          'defines': [
            'USE_BACKTRACE',
          ],
        }],
      ],
    },
  ],
}
