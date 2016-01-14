#### This is an extension that brings voice recognition to silk-device
---

This extension supports two modes.
* Hot keyword listening - This is the default mode where the device is looking for a specific keywork.
The keyword device is looking for is ```ok sense```. Once the device recognizes this keyword, it plays a sound and switches over to the grammar
search as explained below.
* Grammar search - In this mode the device is looking for commands per the defined grammar in ```mode/silk.gram``` file.
The commands that are currently supported are:
  * Turn on lights
  * Turn off lights
  * Dim lights
  * Bright lights

Please note that this is a grammar search mode so the device is not looking for the exact sequence of words. You can say
things like ```Could you please turn on the lights``` or ```Please turn on the lights```. Exact grammar can be looked up in
silk.gram file.

**NOTE:** Once the hot keyword is spotted user only has **five** seconds to start speaking the command or else device
switches back to the keyword listening mode.
