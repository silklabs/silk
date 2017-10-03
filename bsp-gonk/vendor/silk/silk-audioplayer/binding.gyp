{
  "variables": {
    "library_type%": "loadable_module",
  },
  "targets": [
    {
      "target_name": "silk-audioplayer",
      "type": "<(library_type)",
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],

      "conditions": [
        [ "OS==\"android\"", {
          "sources": [
            "src/player.cpp",
            "src/BufferedDataSource.cpp",
            "src/StreamPlayer.cpp",
          ],
          "include_dirs": [
            "<!(echo $ANDROID_BUILD_TOP/frameworks/av/include)",
            "<!(echo $ANDROID_BUILD_TOP/frameworks/native/include)",
            "<!(echo $ANDROID_BUILD_TOP/hardware/libhardware/include)",
            "<!(echo $ANDROID_BUILD_TOP/system/core/include)",
            "<!(echo $ANDROID_BUILD_TOP/system/media/audio/include)",
          ],
          "libraries": [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
          "cflags": [
            "-Wall",
            '-std=c++11',
            '-Wno-sign-compare',
            '-Wno-strict-aliasing',
            '-Wno-sign-promo',
            '-Wno-parentheses',
            '-Wno-missing-field-initializers',
            "<!(echo $SILK_PLAYER_EXTRA_CFLAGS)",
          ],
        }],
      ],
    },
  ],
}
