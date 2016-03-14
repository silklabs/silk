## Welcome Extension

The welcome extension implement the "Welcome Home" behaviour of recognizing
when someone comes/leaves home to set their connected home devices to their
preference.

Currently, LIFX and Sonos are supported. Those devices are automatically
discovered on the local LAN (backhaul Internet not needed).

### Config File

`configs/config.json` stores the configuration. It defines what happens when
specific events are received. Some notes below...

The config file defines two data structures, `triggers` and `modes`

`triggers` - list of events that trigger a change to a new mode (like faceSeen, sound heard)
* `type` - the type of event to trigger off of, choose from:
  * `faceSeen` - to trigger off of a specific face being recognized. If set,
    `faceName` defines the the name of the specific face.
  * `noFaceDetected` - to trigger off of no faces being seen after some time.
     Optionally set `durationMs` to specify the amount of time to wait for no 
     faces before transitioning into this mode.
  * `sound` - to trigger off of a sounds event. If set, `name` defines the specific sound.
* `mode` - mode to enter when event is triggered

`modes` - list of modes that define connected devices states (like music and lights)
* `sonos` - defines state of Sonos for this mode (optional). See below
* `lifx` - defines state of LIFX bulb for this mode (optional). See below.
* `durationMs` - duration to stay in mode (optional).
* `nextMode` - mode to enter when `durationMs` expires. (optional, but must be
  defined if `duratioMs` is set)

`sonos` - defines a Sonos state
* `action`: `play` or `pause`.
* If `action` is `play`, set one of these:
  * `uri` - the specific sonos uri to play 
  * `queryType` and `queryValue` -  to query Sonos for the URI to play
     * `queryType` - can be `artists`, `albumArtists`, `albums`, `genres`,
       `composers`, `tracks`, `playlists`, `share`
     * `queryValue` - value to match query with
  
`lifx` - defines a LIFX bulb state
* `scene`: new scene to change lifx to. Choose from `off`, `blue`,
  `red`, `green`, `purple`. look in `lib/lifx.js` for full list of
  supported colors.

### Setup

* Configure the LIFX and Sonos on the same local network as the device. 
  These devices are automatically discovered on the local LAN (backhaul
  Internet not needed).

* Trigger event. The connected devices should then respond appropriately
  per the config file.
