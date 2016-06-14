/**
 * @flow
 */

// Actions that affect the state of the entire system.

/**
 * Every action must have a unique |type| property, otherwise reducers will not
 * be able to tell which actions are supposed to apply to them.
 */
export const TYPE_RESET = 'RESET';
export const TYPE_SPEAK_BEGIN = 'SPEAK_BEGIN';
export const TYPE_SPEAK_END = 'SPEAK_END';
export const TYPE_INTERPRET_BEGIN = 'INTERPRET_BEGIN';
export const TYPE_INTERPRET_END = 'INTERPRET_END';

/**
 * Actions *must* have a |type| property. Convention dictates that all other
 * data live in a |payload| object with the exception of an |error| property.
 * See https://github.com/acdlite/flux-standard-action.
 */
export type Action =
  {
    type: 'RESET';
  } | {
    type: 'SPEAK_BEGIN',
    payload: {
      text: string;
    },
  } | {
    type: 'SPEAK_END',
  } | {
    type: 'INTERPRET_BEGIN',
  } | {
    type: 'INTERPRET_END',
  }
;

// This action should reset all state to factory install.
export function reset(): Action {
  return {
    type: TYPE_RESET,
  };
}

// Dispatched when currently speaking.
export function speakBegin(text: string): Action {
  return {
    type: TYPE_SPEAK_BEGIN,
    payload: {
      text,
    },
  };
}

// Dispatched when speaking has ended.
export function speakEnd(): Action {
  return {
    type: TYPE_SPEAK_END,
  };
}

// Dispatched when microphone recording and analysis is happening.
export function interpretBegin(): Action {
  return {
    type: TYPE_INTERPRET_BEGIN,
  };
}

// Dispatched when interpreting has finished.
export function interpretEnd(): Action {
  return {
    type: TYPE_INTERPRET_END,
  };
}
