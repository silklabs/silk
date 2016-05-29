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
  ],
}
