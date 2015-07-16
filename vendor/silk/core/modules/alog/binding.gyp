{
  "targets": [
    {
      "target_name": "alog",
      "sources": [
        "bindings.cpp",
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        "<!(echo $ANDROID_BUILD_TOP/system/core/include)"
      ],
      "libraries": [
        "-llog"
      ]
    }
  ]
}
