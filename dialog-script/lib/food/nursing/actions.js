/**
 * @flow
 */

/**
 * These action types must be unique throughout the system so they are prefixed
 * with the directory name.
 */
export const TYPE_SWITCH_SIDE = 'FOOD_NURSING_SWITCH_SIDE';
export const TYPE_REMAINING_TIME_SEC = 'FOOD_NURSING_REMAINING_TIME_SEC';

// Flow needs these as string literals so we can't use the consts above... Grr.
export type Action =
  {
    type: 'FOOD_NURSING_SWITCH_SIDE';
  } | {
    type: 'FOOD_NURSING_REMAINING_TIME_SEC';
    payload: {
      timeRemainingSec: number;
    };
  }
;

// Creates an action that informs us the mother has switched sides.
export function switchSides(): Action {
  return {
    type: 'FOOD_NURSING_SWITCH_SIDE',
  };
}

// Creates an action that updates the remaining time for the current side.
export function updateTimeRemaining(timeRemainingSec: number): Action {
  return {
    type: 'FOOD_NURSING_REMAINING_TIME_SEC',
    payload: {
      timeRemainingSec,
    },
  };
}
