/**
 * @flow
 */

/**
 * These action types must be unique throughout the system so they are prefixed
 * with the directory name.
 */
export const TYPE_ADD = 'TIMERS_ADD';
export const TYPE_EXPIRE = 'TIMERS_EXPIRE';
export const TYPE_REMOVE = 'TIMERS_REMOVE';
export const TYPE_REMOVE_ALL = 'TIMERS_REMOVE_ALL';

export type TimerType = 'alarm' | 'timer';

// Flow needs these as string literals so we can't use the consts above... Grr.
export type Action =
  {
    type: 'TIMERS_ADD';
    payload: {
      durationMs: number;
      expiresMs: number;
      title: string;
      type: TimerType;
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

// Creates an action that will add a timer.
export function addTimer(durationMs: number, expiresMs: number, title: string,
                         type: TimerType = 'timer'): Action {
  return {
    type: TYPE_ADD,
    payload: {
      durationMs,
      expiresMs,
      title,
      type,
    },
  };
}

// Creates an action that signals the expiration of a timer.
export function expireTimer(id: number): Action {
  return {
    type: TYPE_EXPIRE,
    payload: {
      id,
    },
  };
}

// Creates an action that cancels a timer.
export function removeTimer(id: number): Action {
  return {
    type: TYPE_REMOVE,
    payload: {
      id,
    },
  };
}

// Creates an action that will cancel all timers.
export function removeAllTimers(): Action {
  return {
    type: TYPE_REMOVE_ALL,
  };
}
