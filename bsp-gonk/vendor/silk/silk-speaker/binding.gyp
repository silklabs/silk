{
  "variables": {
    "library_type%": "loadable_module",
  },
  "targets": [
    {
      "target_name": "silk-speaker",
      "type": "<(library_type)",
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],

      "conditions": [
        [ "OS==\"android\"", {
          "sources": [
            "src/speaker.cpp",
            "src/audioPlayer.cpp",
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
            '-Wstrict-aliasing',
            '-Wno-sign-promo',
          ],
        }],
      ],
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "silk-speaker" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/silk-speaker.node" ],
          "destination": ".",
        },
      ],
    },
  ],
}
