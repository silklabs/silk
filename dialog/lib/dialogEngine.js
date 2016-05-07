import invariant from 'assert';
import events from 'events';

import createLog from 'silk-log';
const log = createLog('dialog-engine');

class DialogEngine extends events.EventEmitter {
  constructor(scriptData, createInitState) {
    super();

    this._debug = false;

    this._createInitState = createInitState;

    this.initState();
    this._timers = {};

    this._textToIntention = scriptData.textToIntention;
    this._actions = scriptData.actions;

    // validate input state/transition data
    for (const text in this._textToIntention) {
      let intention = this._textToIntention[text];
      invariant(intention.intent);
      invariant(intention.entities);
    }

    for (const actionName in this._actions) {
      let action = this._actions[actionName];

      invariant(action.sayText);
      invariant(action.nextState);
      if (action.strings) {
        invariant(Array.isArray(action.strings));
      }
      if (action.actions) {
        invariant(Array.isArray(action.actions));
      }
    }

    for (const ita of scriptData.intentionToActionData) {
      invariant(ita.length === 4);
      invariant(Array.isArray(ita[2]));
    }

    // create internal structure to easily map intentions to actions.
    // also, check that action actually exists
    this._intentionToAction = {};
    for (const ita of scriptData.intentionToActionData) {
      let state = ita[0];
      let intent = ita[1];
      let entities = ita[2];
      let actionName = ita[3];

      let key = JSON.stringify({state, intent, entities});
      this._intentionToAction[key] = actionName;

      invariant(actionName in this._actions, `${actionName} missing`);
    }
  }

  initState() {
    this._state = Object.assign(this._createInitState(), {
      state: 'ready',
      repeatCount: undefined,
      defaultEntity: undefined,
      setRepeatCount: cnt => this._state.repeatCount = cnt,
      decrRepeatCount: () => this._state.repeatCount--,
      setOrDecrRepeatCount: cnt => this._state.repeatCount = this._state.repeatCount === undefined ? cnt : this._state.repeatCount - 1,
      setTimer: (name, seconds) => this._setTimer(name, seconds),
    });
  }

  _printState() {
    let s = this._state;
    log.debug(`state:`);
    log.debug(`  state: ${s.state}`);
    log.debug(`  repeatCount: ${s.repeatCount}`);
    log.debug(`  defaultEntity: ${s.defaultEntity}`);
    log.debug(`  nurseFeed: ${s.nurseFeed}`);
    log.debug(`  bottleFeed: ${s.bottleFeed}`);
  }

  _setTimer(name, seconds) {
    log.info(`Setting timer ${name} for ${seconds} seconds`);
    if (name in this._timers) {
      log.warn(`timer already set ${name}, cancelling`);
      clearTimeout(this._timers[name]);
      delete this._timers[name];
    }
    this._timers[name] = setTimeout(() => this._onTimerExpired(name), seconds * 1000);
  }

  _onTimerExpired(name) {
    log.info(`Timer ${name} expired`);

    clearTimeout(this._timers[name]);
    delete this._timers[name];

    this._printState();

    let action = this._getAction({intent: 'expired', entities: [name]});
    let {sayText, isLast} = this._processAction(action);

    this._printState();

    this._emitSay(sayText, isLast);
  }

  _emitSay(sayText, isLast) {
    this.emit('say', sayText, isLast);
  }

  // returns intention from text (utterance)
  _getIntention(text) {
    text = text.toLowerCase();
    let intention = Object.assign({}, this._textToIntention[text]);

    if (intention.intent) {
      log.debug(`Found intention for: ${text}`);
    } else {
      log.info(`Did not find intention entry for: ${text}`);

      intention = { intent: 'unknownIntent', entities: [] };
      if (this._state.repeatCount === 0) {
        intention.intent = 'unknownIntentTO';
      }
    }

    // if intention has no entity, use the current entity in context
    if (intention.entities.length === 0 && this._state.defaultEntity) {
      intention.entities = [this._state.defaultEntity];
    }

    log.debug(`Processed intention as: ${intention.intent} and ${intention.entities}`);
    return intention;
  }

  // returns action from intention
  _getAction(intention) {
    let state = this._state.state;
    let intent = intention.intent;
    let entities = intention.entities;

    let key = JSON.stringify({ state, intent, entities });

    let actionName = this._intentionToAction[key];

    if (actionName) {
      log.debug(`Found action: ${actionName}`);
    } else {
      log.info(`missing action for ${state} ${intent} ${entities}`);
      log.info(`Assuming 'failRequest'`);
      actionName = 'failRequest';
    }

    invariant(actionName in this._actions, `${actionName} missing`);
    let action = this._actions[actionName];

    return action;
  }

  _processAction(action) {
    let sayText = action.sayText;

    // replace ${1}, ${2}, ... with strings from list
    for (const i in action.strings) {
      let replaceStr = '${' + (parseInt(i) + 1) + '}';
      sayText = sayText.replace(replaceStr, action.strings[i](this._state));
    }

    if ('commands' in action) {
      for (const command of action.commands) {
        command(this._state);
      }
    }

    this._defaultEntity = action.defaultEntity; // undefined is ok
    this._state.state = action.nextState;

    // normally when next state of ready signifies end of conversation,
    // except when it's not.
    let isLast = this._state.state === 'ready' ? true : false;
    isLast = 'isLast' in action ? action.isLast : isLast;

    return {sayText, isLast};
  }

  processUtterance(text) {
    this._printState();

    let intention = this._getIntention(text);
    let action = this._getAction(intention);
    let {sayText, isLast} = this._processAction(action);

    // special case, when we timeout, clear repeatTimer so we stop repeating
    if (intention.intent === 'unknownIntentTO') {
      this._state.repeatCount = undefined;
    }

    this._printState();

    this._emitSay(sayText, isLast);
  }
}

export default function createDialogEngine(scriptData, createInitState) {
  return new DialogEngine(scriptData, createInitState);
}
