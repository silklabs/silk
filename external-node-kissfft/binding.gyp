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
      ]
    }
  ]
}
