/**
 * @flow
 */

import createLog from 'silk-log';
import invariant from 'assert';

import saga from './saga';
import store from './store';

import {
  speakBegin,
  speakEnd,
  interpretBegin,
  interpretEnd,
} from './actions';

import type {DialogEngine} from 'silk-dialog-engine';
import getDialogEngine from 'silk-dialog-engine';
import textToIntention from './textToIntention';

const log = createLog('dialog-script');

class Script{
  constructor(dialogEngine: DialogEngine) {
    log.info(`Starting script`);
    log.debug(`Initial state`, store.getState());
    store.runSaga(saga, dialogEngine);

    dialogEngine.on(`interpret-begin`, this.onInterpretBegin);
    dialogEngine.on(`interpret-end`, this.onInterpretEnd);
    dialogEngine.on(`speak-begin`, this.onSpeakEnd);
    dialogEngine.on(`speak-end`, this.onSpeakEnd);
  }

  onInterpretBegin: (() => void) = () => store.dispatch(interpretBegin());
  onInterpretEnd: (() => void) = () => store.dispatch(interpretEnd());
  onSpeakBegin: ((text: string) => void) = (text: string) => store.dispatch(speakBegin(text));
  onSpeakEnd: (() => void) = () => store.dispatch(speakEnd());

  willUnload() {
    dialogEngine.removeListener(`interpret-begin`, this.onInterpretBegin);
    dialogEngine.removeListener(`interpret-end`, this.onInterpretEnd);
    dialogEngine.removeListener(`speak-begin`, this.onSpeakBegin);
    dialogEngine.removeListener(`speak-end`, this.onSpeakEnd);
  }
}

let dialogEngine = getDialogEngine();
invariant(dialogEngine);
dialogEngine.configure({textToIntention});
let script = new Script(dialogEngine);

export function silkWillUnload() {
  log.info('Farewell');
  invariant(script);
  script.willUnload();
  script = null;
}
