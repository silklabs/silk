import invariant from 'assert';

import createLog from 'silk-log';
const log = createLog('baby-state');

class BottleFeed {
  constructor() {
    this._type = null;
    this._amount = null;
  }
  toString() {
    return `(type: ${this._type}, amount: ${this._amount})`;
  }
  setFeedAmount(feedOunces) {
    this._amount = feedOunces;
  }
  setFeedType(type) {
    invariant(type === 'formula' || type === 'milk');
    this._type = type;
  }
  logFeed() {
    invariant(this._type);
    log.info(`Logging ${this._type} bottle feed of ${this._amount}`);
  }
}

class NurseFeed {
  constructor(side, timerSeconds) {
    this._lastSide = 'left';
    this._timerSeconds = 5;
  }
  toString() {
    return `(lastSide: ${this._lastSide}, timerSeconds: ${this._timerSeconds})`;
  }
  _otherSide(side) {
    return side === 'left' ? 'right' : 'left';
  }
  get lastSide() {
    return this._lastSide;
  }
  get nextSide() {
    return this._otherSide(this._lastSide);
  }
  get timerSeconds() {
    return this._timerSeconds;
  }
  get timerMinutes() {
    return Math.round(this._timerSeconds / 60);
  }
  toggleSide() {
    this._lastSide = this._otherSide(this._lastSide);
  }
  logSide() {
    log.info(`Logging nursing feed on ${this.lastSide} side for ${this.timerSeconds} seconds`);
  }
}

export default function createInitState() {
  return {
    nurseFeed: new NurseFeed(),
    bottleFeed: new BottleFeed(),
  };
}

