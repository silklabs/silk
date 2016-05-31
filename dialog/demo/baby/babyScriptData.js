/* eslint-disable key-spacing */

// maps text to an intention, which consists of an intent and entities.
const textToIntention = {
  'start feeding':                { intent: 'startFeeding', entities: ['baby'] },
  'i\'m feeding the baby':        { intent: 'startFeeding', entities: ['baby'] },
  'i\'m nursing':                 { intent: 'startNursing', entities: [] },
  'start nursing':                { intent: 'startNursing', entities: [] },
  'nursing':                      { intent: 'none', entities: ['nursing'] },
  'ok':                           { intent: 'confirm', entities: [] },
  'yes':                          { intent: 'confirm', entities: [] },
  'no':                           { intent: 'reject', entities: [] },
  'cancel':                       { intent: 'cancel', entities: [] },
  'switch sides':                 { intent: 'switch', entities: ['side'] },
  'switch side':                  { intent: 'switch', entities: ['side'] },
  'change sides':                 { intent: 'switch', entities: ['side'] },
  'change side':                  { intent: 'switch', entities: ['side'] },
  'stop nursing session':         { intent: 'end', entities: ['nursing'] },
  'stop nursing':                 { intent: 'end', entities: ['nursing'] },
  'i\'m bottle feeding the baby': { intent: 'startBottleFeeding', entities: ['baby'] },
  'bottle':                       { intent: 'confirm', entities: ['bottle'] },
  'formula':                      { intent: 'confirm', entities: ['formula'] },
  'breast milk':                  { intent: 'confirm', entities: ['breast milk'] },
  '6 ounces':                     { intent: 'confirm', entities: ['6 ounces'] },
};
/* eslint-enable key-spacing */

// data to map the (state, intent, entnties) tuple to an actionName
const intentionToActionData = [
  // state, intent, entities, actionName
  ['ready', 'startFeeding', ['baby'], 'askNursingOrBottleFeeding'],
  ['ready', 'startNursing', [], 'startNursingAskFirstNursingTimer'],

  ['waitForFeedType', 'startNursing', [], 'startNursingAskFirstNursingTimer'],
  ['waitForFeedType', 'none', ['nursing'], 'startNursingAskFirstNursingTimer'],

  ['nursingTimerConfirm', 'confirm', [], 'setFirstNusingTimer'],
  ['nursingTimerConfirm', 'reject', [], 'dontSetFirstNursingTimer'],
  ['nursingTimerConfirm', 'unknownIntent', [], 'repeatAskFirstNursingTimer'],
  ['nursingTimerConfirm', 'unknownIntentTO', [], 'skipSwitchFirstNursingTimer'],

  ['ready', 'expired', ['nurseFeedTimer'], 'firstNursingTimerExpired'],
  ['ready', 'switch', ['side'], 'startSecondNursingTimer'],
  ['ready', 'expired', ['nurse2ndFeedTimer'], 'secondNursingTimerExpired'],
  ['ready', 'end', ['nursing'], 'endNursingSession'],

  ['ready', 'startBottleFeeding', ['baby'], 'askMilkOrFormula'],
  ['waitForFeedType', 'confirm', ['bottle'], 'askMilkOrFormula'],
  ['waitForBottleFeedType', 'confirm', ['formula'], 'useFormulaAskFeedAmount'],
  ['waitForBottleFeedType', 'confirm', ['breast milk'], 'useMilkAskFeedAmount'],
  ['waitForBottleFeedType', 'unknownIntent', [], 'repeatAskMilkOrFormula'],
  ['waitForBottleFeedType', 'unknownIntentTO', [], 'failAndCancel'],

  ['waitForBottleFeedAmount', 'confirm', ['6 ounces'], 'recordFeedAmount'],
  ['waitForBottleFeedAmount', 'unknownIntent', [], 'repeatAskFeedAmount'],
  ['waitForBottleFeedAmount', 'unknownIntentTO', [], 'failAndCancel'],

  ['waitForFeedType', 'unknownIntent', [], 'repeatAskNursingOrBottleFeeding'],
  ['waitForFeedType', 'unknownIntentTO', [], 'failAndCancel'],

  ['ready', 'unknownIntent', [], 'askRepeat'],
  ['ready', 'cancel', [], 'cancelDialog'],
  ['ready', 'unknownIntentTO', [], 'failRequest'],
];

// maps actionNames to an action, consisting of:
//   - sayText       - response phrase to say
//   - commands      - a set of commands to run (optional)
//   - nextState     - the next state to transition into
//   - defaultEntity - entity to use as context for next utterance (optional)
//   - isLast        - true if no more utterances are expected (optional)
const actions = {

  'askNursingOrBottleFeeding': {
    sayText: `OK, are you nursing or bottle feeding?`,
    commands: [s => s.repeatCount = 2],
    nextState: 'waitForFeedType',
    defaultEntity: 'baby',
  },

  'startNursingAskFirstNursingTimer': {
    sayText: 'Based on your previous session, you should start nursing on the ${1} side. Would you like me to tell you when it\'s time to switch sides?',
    strings: [s => s.nurseFeed.nextSide],
    commands: [s => s.nurseFeed.toggleSide()],
    nextState: 'nursingTimerConfirm',
    defaultEntity: 'nursingTimer',
  },

  'setFirstNusingTimer': {
    sayText: 'OK, setting the alert for ${1} seconds.',
    strings: [s => s.nurseFeed.timerSeconds],
    commands: [s => s.setTimer('nurseFeedTimer', s.nurseFeed.timerSeconds)],
    nextState: 'ready',
  },

  'dontSetFirstNursingTimer': {
    sayText: 'OK, I won\'t remind you when to switch sides.',
    commands: [],
    nextState: 'ready',
  },

  'repeatAskFirstNursingTimer': {
    sayText: 'Sorry, I didn\'t get that. Would you like an alert to remind you to switch sides after ${1} seconds?',
    strings: [s => s.nurseFeed.timerSeconds],
    commands: [s => s.repeatCount--],
    nextState: 'nursingTimerConfirm',
    defaultEntity: 'nursingTimer',
  },

  'skipSwitchFirstNursingTimer': {
    sayText: 'Sorry, I\'m not understanding. I\'ll just not set the timer for you. Thanks.',
    nextState: 'ready',
  },

  'firstNursingTimerExpired': {
    sayText: '${1} seconds has passed. Time to switch to the ${2} side.',
    strings: [s => s.nurseFeed.timerSeconds, s => s.nurseFeed.nextSide],
    commands: [s => s.nurseFeed.logSide(), s => s.nurseFeed.toggleSide()],
    nextState: 'ready',
  },

  'startSecondNursingTimer': {
    sayText: 'Starting nursing timer on the ${1} side.',
    strings: [s => s.nurseFeed.nextSide],
    commands: [s => s.setTimer('nurse2ndFeedTimer', s.nurseFeed.timerSeconds)],
    nextState: 'ready',
  },

  'secondNursingTimerExpired': {
    sayText: '${1} seconds has passed. Time to end nursing session.',
    strings: [s => s.nurseFeed.timerSeconds],
    nextState: 'ready',
  },

  'endNursingSession': {
    sayText: 'OK, entry recorded',
    commands: [s => s.nurseFeed.logSide(), s => s.nurseFeed.toggleSide()],
    nextState: 'ready',
  },

  'askMilkOrFormula': {
    sayText: 'OK, are you using breast milk or forumla?',
    commands: [s => s.setRepeatCount(2)],
    nextState: 'waitForBottleFeedType',
    defaultEntity: 'bottleFeedType',
  },

  'useFormulaAskFeedAmount': {
    sayText: 'OK, how many ounces?',
    commands: [s => s.bottleFeed.setFeedType('formula'), s => s.setRepeatCount(2)],
    nextState: 'waitForBottleFeedAmount',
    defaultEntity: 'feedAmount',
  },

  'useMilkAskFeedAmount': {
    sayText: 'OK, how many ounces?',
    commands: [s => s.bottleFeed.setFeedType('milk'), s => s.setRepeatCount(2)],
    nextState: 'waitForBottleFeedAmount',
    defaultEntity: 'feedAmount',
  },

  'repeatAskMilkOrFormula': {
    sayText: 'Sorry, I didn\'t get that. Are you using breast milk or formula?',
    commands: [s => s.decrRepeatCount()],
    nextState: 'waitForBottleFeedType',
    defaultEntity: 'feedAmount',
  },

  'failAndCancel': {
    sayText: 'Sorry, I\'m not understanding. Please try again from the begining.',
    nextState: 'ready',
  },

  'recordFeedAmount': {
    sayText: 'OK, entry recorded',
    commands: [s => s.bottleFeed.logFeed()],
    nextState: 'ready',
  },

  'repeatAskFeedAmount': {
    sayText: 'Sorry, I didn\'t get that. How many ounces are you feeding?',
    commands: [s => s.decrRepeatCount()],
    nextState: 'waitForBottleFeedType',
    defaultEntity: 'feedAmount',
  },

  'repeatAskNursingOrBottleFeeding': {
    sayText: 'Sorry, I didn\'t get that. Are you nursing or bottle feeding?',
    commands: [s => s.decrRepeatCount()],
    nextState: 'waitForFeedType',
    defaultEntity: 'baby',
  },

  'askRepeat': {
    sayText: 'Sorry, I didn\'t get that. Please try again.',
    commands: [s => s.setOrDecrRepeatCount(2)],
    nextState: 'ready',
    isLast: false,
  },

  'cancelDialog': {
    sayText: 'OK, canceling.',
    nextState: 'ready',
    isLast: true,
  },

  'failRequest': {
    sayText: 'Sorry, I\'m not understanding you. Please check out the app for example requests and questions and try again. Thanks.',
    nextState: 'ready',
  },

};

const scriptData = { textToIntention, intentionToActionData, actions };

export default scriptData;
