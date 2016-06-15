/**
 * @flow
 */

/**
 * These action types must be unique throughout the system so they are prefixed
 * with the directory name.
 */
export const TYPE_BOTTLE_TYPE = 'FOOD_BOTTLE_TYPE';
export const TYPE_BOTTLE_AMOUNT = 'FOOD_BOTTLE_AMOUNT';

// Flow needs these as string literals so we can't use the consts above... Grr.
export type Action =
  {
    type: 'FOOD_BOTTLE_TYPE';
    payload: {
      type: 'formula' | 'milk';
    };
  } | {
    type: 'FOOD_BOTTLE_AMOUNT';
    payload: {
      amountMl: number;
    };
  }
;

// Creates an action that will set the type of bottle.
export function bottleType(type: 'formula' | 'milk'): Action {
  return {
    type: 'FOOD_BOTTLE_TYPE',
    payload: {
      type,
    },
  };
}

// Creates an action that will set the amount of food in the bottle.
export function bottleAmount(amountMl: number): Action {
  return {
    type: 'FOOD_BOTTLE_AMOUNT',
    payload: {
      amountMl,
    },
  };
}
