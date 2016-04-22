{
  "targets": [
    {
      "target_name": "silk-cv",
      "sources": [
        "capture.cpp",
        "dlib.cpp",
        "faceDetector.cpp",
        "init.cpp",
        "matrix.cpp",
        "mog2.cpp",
        "tracker.cpp",
        "CppMT/CMT.cpp",
        "CppMT/Consensus.cpp",
        "CppMT/Fusion.cpp",
        "CppMT/Matcher.cpp",
        "CppMT/Tracker.cpp",
        "CppMT/common.cpp",
        "CppMT/fastcluster/fastcluster.cpp",
      ],

      "cflags!" : [ "-fno-exceptions"],
      "cflags_cc!": [ "-fno-rtti",  "-fno-exceptions"],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        '<!(node -e "require(\'silk-external-dlib\')")',
      ],

      "conditions": [
        [ "OS==\"android\"", {
          "include_dirs": [
            "<!(echo \" -I $ANDROID_BUILD_TOP/external/node-opencv/inc \")",
            "<!(echo $ANDROID_BUILD_TOP/system/core/include)",
            "<!(echo $ANDROID_BUILD_TOP/vendor/opensilk/capture)",
          ],
          "libraries": [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
          "cflags": [
            "-Wall",
          ],
        }],
        [ "OS==\"linux\"", {
          "include_dirs": [
            "<!@(pkg-config --cflags opencv)",
            "<!(node -e \"require('opencv/include_dirs')\")",
          ],
          "libraries": [
            "<!@(pkg-config --libs opencv)",
          ],
          "cflags": [
            "<!@(pkg-config --cflags \"opencv >= 2.3.1\" )",
            "-Wall"
          ],
        }],
        [ "OS==\"mac\"", {
            "include_dirs": [
              "<!(node -e \"require('opencv/include_dirs')\")",
            ],
            "libraries": [
              "<!@(pkg-config --libs opencv)",
            ],
            "xcode_settings": {
              "OTHER_CFLAGS": [
                "-mmacosx-version-min=10.7",
                "-std=c++11",
                "-stdlib=libc++",
                "<!@(pkg-config --cflags opencv)",
              ],
              "GCC_ENABLE_CPP_RTTI": "YES",
              "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          },
        }],
      ],
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "silk-cv" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/silk-cv.node" ],
          "destination": ".",
        },
      ],
    },
  ],
}
