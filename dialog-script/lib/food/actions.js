/**
 * @flow
 */

/**
 * These action types must be unique throughout the system so they are prefixed
 * with the directory name.
 */
export const TYPE_RESET_FOOD = 'RESET_FOOD';

// Flow needs these as string literals so we can't use the consts above... Grr.
export type Action =
  {
    type: 'RESET_FOOD';
  }
;

// Creates an action that will reset the state of both bottle and nursing.
export function resetFood(): Action {
  return {
    type: TYPE_RESET_FOOD,
  };
}
