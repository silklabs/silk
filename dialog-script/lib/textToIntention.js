/* eslint-disable */
module.exports = {
  "start feeding":               { "intent": "startFeeding", "entities": ["baby"] },
  "i'm feeding the baby":        { "intent": "startFeeding", "entities": ["baby"] },
  "i'm nursing":                 { "intent": "startNursing", "entities": [] },
  "start nursing":               { "intent": "startNursing", "entities": [] },
  "nursing":                     { "intent": "none", "entities": ["nursing"] },
  "ok":                          { "intent": "confirm", "entities": [] },
  "yes":                         { "intent": "confirm", "entities": [] },
  "no":                          { "intent": "reject", "entities": [] },
  "cancel":                      { "intent": "cancel", "entities": [] },
  "switch sides":                { "intent": "switch", "entities": ["side"] },
  "switch side":                 { "intent": "switch", "entities": ["side"] },
  "change sides":                { "intent": "switch", "entities": ["side"] },
  "change side":                 { "intent": "switch", "entities": ["side"] },
  "stop nursing session":        { "intent": "end", "entities": ["nursing"] },
  "stop nursing":                { "intent": "end", "entities": ["nursing"] },
  "i'm bottle feeding the baby": { "intent": "startBottleFeeding", "entities": ["baby"] },
  "bottle":                      { "intent": "confirm", "entities": ["bottle"] },
  "formula":                     { "intent": "confirm", "entities": ["formula"] },
  "breast milk":                 { "intent": "confirm", "entities": ["breast milk"] },
  "100 milliliters":             { "intent": "confirm", "entities": ["100 milliliters"] },
  "register my baby":            { "intent": "register", "entities": ["baby"] },
  "rename my baby":              { "intent": "rename", "entities": ["baby"] },
  "what time is it":             { "intent": "currentTime", "entities": [] }
};
/* eslint-enable */
