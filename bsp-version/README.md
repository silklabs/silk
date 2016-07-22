The BSP API identifier (`bsp_api_id`)  is used to determine of a silkota (which only replaces
/system/silk/...) can be applied on the device.

If and only if the API version matches exactly between the device and the
silkota.zip file the silkota may be applied.

Increment `bsp_api_id` whenever there's an incompatible change to the device bsp
software that would necessitate a full OTA update, such as modifying /init.silk.rc.
