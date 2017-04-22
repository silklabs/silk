{
      'targets': [
        {
          "target_name": "action_after_build",
          "type": "none",
          "dependencies": [ "nnpack" ],
          "copies": [
            {
              "files": [ "<(NNPACK_ROOT)/lib/libnnpack.so" ],
              "destination": "<(PRODUCT_DIR)",
            },
          ],
        },
      ]
}
