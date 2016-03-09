## Welcome Extension

The welcome extension implement the "Welcome Home" behaviour of recognizing
when someone comes/leaves home to set their connected home devices to their
preference.

Currently, LIFX and Sonos are supported. Those devices are automatically
discovered on the local LAN (backhaul Internet not needed).

### Config File

`configs/config.json` stores the configuration. It defines what happens when
specific events are received. Some notes below...

`type` - the type of event to trigger off of, choose from:
* `faceSeen` -  to trigger off of a specific face being recognized. If set,
   also set `faceName`, which is the name of the face.
* `noFaceDetected` - to trigger roff of a no faces being seen after some time.
   Optionally set `durationMs` to specify the amount of time to wait for no 
   faces before transitioning into this mode.

`sonos` - specifies how to configure Sonos when event is triggered (optional)
* `action`: `play` or `pause`.
* If `action` is `play`, set one of these:
  * `uri` - the specific sonos uri to play 
  * `queryType` and `queryValue` -  to query Sonos for the URI to play
     * `queryType` - can be `artists`, `albumArtists`, `albums`, `genres`,
       `composers`, `tracks`, `playlists`, `share`
     * `queryValue` - value to match query with
  
`lifx`: specifies how to configure LIFX when event is triggered (optional)
* `scene`: new scene to change lifx to. Choose from `off`, `blue`,
  `red`, `green`, `purple`. look in `lib/lifx.js` for full list of
  supported colors.

### Setup

* Configure the LIFX and Sonos on the same local network as the device. 
  These devices are automatically discovered on the local LAN (backhaul
  Internet not needed).

* Trigger event and connected devices should respond appropriately

### Issues

* Sonos is sometimes not discovered. Workaround is to modify the code
  to hard code the IP address.

