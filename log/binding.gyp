{
  "variables": {
    "library_type%": "loadable_module",
    "liblog%": "false",
  },
  "targets": [
    {
      "target_name": "silk-alog",
      "type": "<(library_type)",
      "sources": [
        "bindings.cpp",
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],
      "conditions": [
        [ "liblog=='true'", {
          "libraries": [
            "-llog",
          ],
        }],
        [ "liblog=='false'", {
          "include_dirs": [
            "include",
          ],
        }],
        [ 'OS=="android"', {
          'libraries': [
            '<!(echo $Android_mk__LIBRARIES)',
          ],
        }],
      ],
    }
  ]
}
