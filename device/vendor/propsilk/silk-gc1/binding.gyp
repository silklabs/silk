{
  "targets": [
    {
      "target_name": "silk-gc1",
      "sources": [
        "bindings.cpp",
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
          },
        ],
      ],
    },
    {
      "target_name": "action_after_build",
      "type": "none",
      "dependencies": [ "silk-gc1" ],
      "copies": [
        {
          "files": [ "<(PRODUCT_DIR)/silk-gc1.node" ],
          "destination": ".",
        },
      ],
    },
  ],
}
