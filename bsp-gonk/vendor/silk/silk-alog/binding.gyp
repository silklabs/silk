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
      "libraries": [
        "<!(echo $Android_mk__LIBRARIES)",
      ]
    }
  ]
}
