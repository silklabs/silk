/* eslint-disable key-spacing, quotes, comma-dangle */

module.exports = {
  // Baby dialogs
  "start feeding":               { "intent": "startFeeding", "entities": ["baby"] },
  "i'm feeding the baby":        { "intent": "startFeeding", "entities": ["baby"] },
  "i am feeding the baby":       { "intent": "startFeeding", "entities": ["baby"] },
  "i'm nursing":                 { "intent": "startNursing", "entities": [] },
  "i am nursing":                { "intent": "startNursing", "entities": [] },
  "start nursing":               { "intent": "startNursing", "entities": [] },
  "nursing":                     { "intent": "None", "entities": ["nursing"] },
  "ok":                          { "intent": "confirm", "entities": [] },
  "yes":                         { "intent": "confirm", "entities": [] },
  "no":                          { "intent": "reject", "entities": [] },
  "cancel":                      { "intent": "cancel", "entities": [] },
  "i'm bottle feeding the baby": { "intent": "startBottleFeeding", "entities": ["baby"] },
  "i am bottle feeding the baby":{ "intent": "startBottleFeeding", "entities": ["baby"] },
  "bottle":                      { "intent": "None", "entities": ["bottle"] },
  "formula":                     { "intent": "None", "entities": ["formula"] },
  "breast milk":                 { "intent": "None", "entities": ["breast milk"] },
  "100 ml":                      { "intent": "None", "entities": ["100 milliliters"] },
  "register my baby":            { "intent": "register", "entities": ["baby"] },
  "rename my baby":              { "intent": "rename", "entities": ["baby"] },
  "what time is it":             { "intent": "currentTime", "entities": [] },
  "start a timer for 30 seconds":{ "intent": "startTimer", "entities": ["30 seconds"] },
  "cancel the timer":            { "intent": "cancelTimer", "entities": ["30 seconds"] },

  // Device control dialogs
  "volume up":                   { "intent": "setVolume", "entities": ["up"] },
  "volume down":                 { "intent": "setVolume", "entities": ["down"] },
  "do not disturb":              { "intent": "setUiMode", "entities": ["dnd"] },
  "all sound off":               { "intent": "setUiMode", "entities": ["mute"] },
  "normal":                      { "intent": "setUiMode", "entities": ["normal"] },
  "factory reset":               { "intent": "factoryReset", "entities": [] },

  // Demo dialogs
  "make me a sandwich":          { "intent": "xkcd", "entities": ["149"] },
  "sudo make me a sandwich":     { "intent": "xkcd", "entities": ["149", "sudo"] },

/* Comment out to use luis
  // see stocks/saga.js for list of supported stocks
  "what's the stock price of apple":  { "intent": "getStockPrice", "entities": ["apple"] },
  "what is the stock price of microsoft": { "intent": "getStockPrice", "entities": ["microsoft"] },
  "how's qualcomm stock doing":          { "intent": "getStockPrice", "entities": ["qualcomm"] },
  "how is google stock doing":         { "intent": "getStockPrice", "entities": ["google"] },
  "how's amazon stock doing today":    { "intent": "getStockPrice", "entities": ["amazon"] },
  "how is mattel stock doing today":   { "intent": "getStockPrice", "entities": ["mattel"] },

  "what's the weather today?":        { "intent": "getWeather", "entities": [] },
  "what's the weather like today?":   { "intent": "getWeather", "entities": [] },
  "how's the weather?":               { "intent": "getWeather", "entities": [] },
  "how's the weather today?":         { "intent": "getWeather", "entities": [] },

  "start music":                      { "intent": "playMusic", "entities": [] },
  "play music":                       { "intent": "playMusic", "entities": [] },
  "stop music":                       { "intent": "pauseMusic", "entities": [] },
  "pause music":                      { "intent": "pauseMusic", "entities": [] },

  "turn on the light":                { "intent": "turnOn", "entities": ["light"] },
  "turn on the lights":               { "intent": "turnOn", "entities": ["lights"] },
  "turn the light on":                { "intent": "turnOn", "entities": ["light"] },
  "turn the lights on":               { "intent": "turnOn", "entities": ["lights"] },

  "turn off the light":               { "intent": "turnOff", "entities": ["light"] },
  "turn off the lights":              { "intent": "turnOff", "entities": ["light"] },
  "turn the light off":               { "intent": "turnOff", "entities": ["light"] },
  "turn the lights off":              { "intent": "turnOff", "entities": ["lights"] },
*/

};

/* eslint-enable */
