{
  "targets": [
    {
      "target_name": "gc1",
      "sources": [
        "bindings.cpp",
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
    }
  ]
}
