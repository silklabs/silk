{
  "targets": [
    {
      "target_name": "kissfft",
      "sources": [
        "src/bindings.cpp",
      ],
      "include_dirs" : [
        "src",
        "<!(node -e \"require('nan')\")"
      ],
      "dependencies" : [
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
    }
  ]
}
