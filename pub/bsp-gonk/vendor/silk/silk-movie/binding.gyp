{
  "targets": [
    {
      "target_name": "silk-movie",
      "sources": [
        "bindings.cpp",
        "BootAnimation.cpp",
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")",
      ],
      "conditions": [
        [
          "OS=='android'", {
            "libraries" : [
              "<!(echo $Android_mk__LIBRARIES)",
            ],
            "cflags" : [
              "-DANDROID",
              "<!(echo $SILK_MOVIE_EXTRA_CFLAGS)",
              "-DGL_GLEXT_PROTOTYPES",
              "-DEGL_EGLEXT_PROTOTYPES",
              "-isystem <!(echo $ANDROID_BUILD_TOP/external/skia/include/core)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/av/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/vendor/silk/silk-movie/frameworks/base/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/native/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/native/opengl/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/hardware/libhardware/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/system/core/include)",
            ],
          },
        ],
      ],
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "silk-movie" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/silk-movie.node" ],
          "destination": ".",
        },
      ],
    },
  ],
}
