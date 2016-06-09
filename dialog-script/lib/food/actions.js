/**
 * @flow
 */

export const TYPE_RESET_FOOD = 'RESET_FOOD';

export type Action =
  {
    type: 'RESET_FOOD';
  }
;

export function resetFood(): Action {
  return {
    type: TYPE_RESET_FOOD,
  };
}
