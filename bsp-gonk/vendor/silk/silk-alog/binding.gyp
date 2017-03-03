{
  "targets": [
    {
      "target_name": "silk-alog",
      "sources": [
        "bindings.cpp",
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],
      "conditions": [
        [
          "OS == 'android'", {
            "libraries" : [
              "<!(echo $Android_mk__LIBRARIES)",
            ],
            "cflags" : [
              "-DANDROID",
            ],
          },
          'OS == "linux"', {
            'libraries': [
              '<!(test -z "$BSP_LE" || echo "-llog")',
            ],
            'cflags': [
              '<!(test -z "$BSP_LE" || echo "-DANDROID")',
            ],
          },
        ],
      ],
    }
  ]
}
