/* eslint-disable key-spacing, quotes, comma-dangle */

module.exports = {
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
  "cancel the timer":            { "intent": "cancelTimer", "entities": ["30 seconds"] }
};

/* eslint-enable */
