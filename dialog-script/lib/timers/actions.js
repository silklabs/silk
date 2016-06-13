/**
 * @flow
 */

export const TYPE_ADD = 'TIMERS_ADD';
export const TYPE_EXPIRE = 'TIMERS_EXPIRE';
export const TYPE_REMOVE = 'TIMERS_REMOVE';
export const TYPE_REMOVE_ALL = 'TIMERS_REMOVE_ALL';

export type Action =
  {
    type: 'TIMERS_ADD';
    payload: {
      durationMs: number;
      expiresMs: number;
    };
  } | {
    type: 'TIMERS_EXPIRE' | 'TIMERS_REMOVE';
    payload: {
      id: number;
    };
  } | {
    type: 'TIMERS_REMOVE_ALL';
  }
;

export function addTimer(durationMs: number, expiresMs: number): Action {
  return {
    type: TYPE_ADD,
    payload: {
      durationMs,
      expiresMs,
    },
  };
}

export function expireTimer(id: number): Action {
  return {
    type: TYPE_EXPIRE,
    payload: {
      id,
    },
  };
}

export function removeTimer(id: number): Action {
  return {
    type: TYPE_REMOVE,
    payload: {
      id,
    },
  };
}

export function removeAllTimers(): Action {
  return {
    type: TYPE_REMOVE_ALL,
  };
}
