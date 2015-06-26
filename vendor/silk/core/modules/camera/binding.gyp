{
  "targets": [
    {
      "target_name": "camera",
      "sources": [
        "bindings.cpp",
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      "conditions": [
        [
          "OS=='android'", {
            "libraries" : [
              "-lbinder",
              "-lcamera_client",
              "-lgui",
              "-lmedia",
              "-lutils"
            ],
            "cflags" : [
              "-isystem <!(echo $ANDROID_BUILD_TOP/frameworks/av/include)",
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
