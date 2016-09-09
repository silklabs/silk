import createLog from 'silk-log';
const log = createLog(`dialog-script-textToIntention`);

let intentions = {};

// Utility to add intention. Possible usage:
//   1) ai(phrase, intent)
//   2) ai(phrase, intent, entity1Type, entity1Name, entity1Extra)
//   3) ai(phrase, intent, entity1Type, entity1Name, entity2Extra,
//          entity2Type, entity2Name, entity2Extra ...)
function ai() {
  let i = 0;
  let phrase = arguments[i++];
  let intent = arguments[i++];
  let entities = [];

  log.debug(`Adding intention: '${phrase}' ${intent}`);
  for (; i < arguments.length;) {
    let type = arguments[i++];
    let entity = arguments[i++];
    let extras = arguments[i++];

    log.debug(`  ... entity: ${type} ${entity} ${extras}`);
    let startIndex = phrase.indexOf(entity);
    let endIndex = startIndex + entity.length;
    let e = Object.assign({}, { type, entity, startIndex, endIndex }, extras);
    entities.push(e);
  }
  intentions[phrase] = { intent, entities };
}

// Baby dialogs
ai(`start feeding`, 'startFeeding', 'baby', 'baby', {});
ai(`i'm feeding the baby`, 'startFeeding', 'baby', 'baby', {});
ai(`i'm feeding the baby`, 'startFeeding', 'baby', 'baby', {});
ai(`i am feeding the baby`, 'startFeeding', 'baby', 'baby', {});
ai(`i'm nursing`, 'startNursing');
ai(`i am nursing`, 'startNursing');
ai(`start nursing`, 'startNursing');
ai(`nursing`, 'None', 'nursing', 'nursing');
ai(`ok`, 'confirm');
ai(`yes`, 'confirm');
ai(`no`, 'reject');
ai(`cancel`, 'cancel');
ai(`i'm bottle feeding the baby`, 'startBottleFeeding', 'baby', 'baby', {});
ai(`i am bottle feeding the baby`, 'startBottleFeeding', 'baby', 'baby', {});
ai(`bottle`, 'None', 'bottle', 'bottle', {});
ai(`formula`, 'None', 'formula', 'formula', {});
ai(`breast milk`, 'None', 'breast milk', 'breast milk', {});
ai(`100 ml`, 'None', 'builtin.number', '100', {});
ai(`hundred ml`, 'None', 'builtin.number', 'hundred', {});
ai(`register my baby`, 'register', 'baby', 'baby', {});
ai(`rename my baby`, 'rename', 'baby', {});

// Device control dialogs
ai(`volume up`, 'setVolume', 'direction', 'up', {});
ai(`volume down`, 'setVolume', 'direction', 'down', {});
ai(`do not disturb`, 'setUiMode', 'mode', 'dnd', {});
ai(`all sound off`, 'setUiMode', 'mode', 'mute', {});
ai(`normal`, 'setUiMode', 'mode', 'normal', {});
ai(`factory reset`, 'factoryReset');
ai(`night light red`, 'setNightlightColor', 'color', 'red', {});
ai(`night light white`, 'setNightlightColor', 'color', 'white', {});
ai(`night light blue`, 'setNightlightColor', 'color', 'blue', {});

// Demo dialogs
ai(`make me a sandwich`, 'xkcd', 'number', '149', {});
ai(`sudo make me a sandwich`, 'xkcd', 'number', '149-sudo', {});

ai(`software version`, 'getSoftwareVersion');

ai(`what time is it`, 'getCurrentTime');
ai(`what's the time now`, 'getCurrentTime');
ai(`what is the time now`, 'getCurrentTime');

ai(`start music`, 'playMusic');
ai(`play music`, 'playMusic');
ai(`stop music`, 'pauseMusic');
ai(`pause music`, 'pauseMusic');
ai(`play sonos`, 'playSonos');
ai(`pause sonos`, 'pauseSonos');
ai(`stop sonos`, 'pauseSonos');

ai(`turn on the light`, 'turnOn', 'light', 'light', {});
ai(`turn on the lights`, 'turnOn', 'light', 'lights', {});
ai(`turn the light on`, 'turnOn', 'light', 'light', {});
ai(`turn the lights on`, 'turnOn', 'light', 'lights', {});

ai(`turn off the light`, 'turnOff', 'light', 'light', {});
ai(`turn off the lights`, 'turnOff', 'light', 'lights', {});
ai(`turn the light off`, 'turnOff', 'light', 'light', {});
ai(`turn the lights off`, 'turnOff', 'light', 'lights', {});

/*
ai(`start a timer for 5 seconds`, 'startTimer', 'builtin.datetime.duration',
    '5 seconds', { resolution: { duration: 'PT5S' } } );
ai(`cancel the 5 seconds timer`, 'cancelTimer', 'builtin.datetime.duration',
    '5 seconds', { resolution: { duration: 'PT5S' } } );

ai(`what's the stock price?`, 'getStockPrice');
ai(`what's the stock price of apple`, 'getStockPrice', 'stock', 'apple', {});
ai(`what is the stock price of microsoft`,
    'getStockPrice', 'stock', 'microsoft', {});
ai(`how's qualcomm stock doing`, 'getStockPrice', 'stock', 'qualcomm', {});
ai(`how is google stock doing`, 'getStockPrice', 'stock', 'google', {});
ai(`how's amazon stock doing today`, 'getStockPrice', 'stock', 'amazon', {});
ai(`how is mattel stock doing today`, 'getStockPrice', 'stock', 'mattel', {});
*/

module.exports = intentions;
