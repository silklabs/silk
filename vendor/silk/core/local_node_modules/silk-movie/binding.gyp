{
  "targets": [
    {
      "target_name": "movie",
      "sources": [
        "bindings.cpp",
        "BootAnimation.cpp",
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        [
          "OS=='android'", {
            "libraries" : [
              "-lEGL",
              "-lGLESv1_CM",
              "-landroidfw",
              "-lbinder",
              "-lgui",
              "-llog",
              "-lskia",
              "-lui",
              "-lutils"
            ],
            "cflags" : [
              "-DGL_GLEXT_PROTOTYPES",
              "-DEGL_EGLEXT_PROTOTYPES",
              "-isystem <!(echo $ANDROID_BUILD_TOP/external/skia/include/core)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/av/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/vendor/silk/core/local_node_modules/silk-movie/frameworks/base/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/native/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/native/opengl/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/hardware/libhardware/include)",
              "-isystem <!(echo $ANDROID_BUILD_TOP/system/core/include)"
            ]
          }
        ]
      ],
      "dependencies" : [
      ]
    }
  ]
}
