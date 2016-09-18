/**
 * @flow
 */

'use strict';

let createLog = require('silk-log');
const log = createLog(`luis-babyModel`);

let Luis = require('./luis');

let luis = new Luis({
  appId: '8b2dc7ac-9be1-4f70-b9a7-a09e4def85ac',
  subscriptionKey: '0e6a5c9f33a14422ad6f1bad7c77926e',
});

let intents = [ 'end', 'reject', 'switch', 'cancel', 'startBottleFeeding',
    'register', 'startNursing', 'startFeeding', 'rename', 'confirm',
    'currentTime' ];

let entities = [ 'formula', 'bottle', 'breast milk', 'nursing', 'milliliter',
    'side', 'baby', '100 milliliters', '30 seconds' ];

let prebuilts = [ 'number' ];

let examples = [
  luis.newExample(`Start feeding`, 'startFeeding'),
  luis.newExample(`I'm feeding the baby`, 'startFeeding', {baby: 'baby'}),
  luis.newExample(`I'm nursing`, 'startNursing'),
  luis.newExample(`Start nursing`, 'startNursing'),
  luis.newExample(`Nursing`, 'None', {nursing: 'Nursing'}),
  luis.newExample(`Ok`, 'confirm'),
  luis.newExample(`Yes`, 'confirm'),
  luis.newExample(`No`, 'reject'),
  luis.newExample(`Cancel`, 'cancel'),
  luis.newExample(`Switch sides`, 'switch', {side: 'sides'}),
  luis.newExample(`Switch side`, 'switch', {side: 'side'}),
  luis.newExample(`Change sides`, 'switch', {side: 'sides'}),
  luis.newExample(`Change side`, 'switch', {side: 'side'}),
  luis.newExample(`Stop nursing session`, 'end', {nursing: 'nursing session'}),
  luis.newExample(`Stop nursing`, 'end', {nursing: 'nursing'}),
  luis.newExample(`I'm bottle feeding the baby`, 'startBottleFeeding', {baby: 'baby'}),
  luis.newExample(`Bottle`, 'None', {formula: 'Bottle'}),
  luis.newExample(`Formula`, 'None', {bottle: 'Formula'}),
  luis.newExample(`Breast milk`, 'None', {'breast milk': 'Breast milk'}),
  luis.newExample(`100 ml`, 'None', {'100 milliliters': '100 ml'}),
  luis.newExample(`Register my baby`, 'register', {'baby': 'baby'}),
  luis.newExample(`Rename my baby`, 'rename', {'baby': 'baby'}),
  luis.newExample(`What time is it`, 'currentTime'),
];

Promise.resolve()
.then(() => luis.removeAllIntents()).then(() => luis.addIntents(intents))
.then(() => luis.removeAllEntities()).then(() => luis.addEntities(entities))
.then(() => luis.removeAllPrebuilts()).then(() => luis.addPrebuilts(prebuilts))
.then(() => luis.removeAllExamples()).then(() => luis.addExamples(examples))
.then(() => luis.train())
.then(() => log.info('Done building Luis baby model'))
.catch(e => log.error(e));

