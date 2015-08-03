{
  "targets": [
    {
      "target_name": "silk-alog",
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
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "silk-alog" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/silk-alog.node" ],
          "destination": "."
        }
      ]
    }
  ]
}
