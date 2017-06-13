{
  "targets": [{
    "target_name": "ab_neuter",
    "sources": [ "src/ab_neuter.cc" ],
    "conditions": [
      [
        "OS=='android'", {
          "libraries" : [
            "<!(echo $Android_mk__LIBRARIES)",
          ],
        },
      ],
    ],
    "win_delay_load_hook" : "false"
  }]
}

