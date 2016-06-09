/**
 * @flow
 */

export const TYPE_RESET = 'RESET';
export const TYPE_SPEAK_BEGIN = 'SPEAK_BEGIN';
export const TYPE_SPEAK_END = 'SPEAK_END';
export const TYPE_INTERPRET_BEGIN = 'INTERPRET_BEGIN';
export const TYPE_INTERPRET_END = 'INTERPRET_END';

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

export function reset(): Action {
  return {
    type: TYPE_RESET,
  };
}

export function speakBegin(text: string): Action {
  return {
    type: TYPE_SPEAK_BEGIN,
    payload: {
      text,
    },
  };
}

export function speakEnd(): Action {
  return {
    type: TYPE_SPEAK_END,
  };
}

export function interpretBegin(): Action {
  return {
    type: TYPE_INTERPRET_BEGIN,
  };
}

export function interpretEnd(): Action {
  return {
    type: TYPE_INTERPRET_END,
  };
}
