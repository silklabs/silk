{
  "targets": [
    {
      "target_name": "silk-properties",
      "sources": [
        "bindings.cpp",
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],
      "conditions": [
        [
          "OS=='android'", {
            "libraries" : [
              "<!(echo $Android_mk__LIBRARIES)"
            ],
            "cflags" : [
              "-DANDROID",
            ],
            "include_dirs": [
              "<!(node -e \"require('nan')\")",
            ],
          }
        ]
      ]

    }
  ]
}
