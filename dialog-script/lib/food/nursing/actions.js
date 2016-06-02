/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

export const TYPE_SWITCH_SIDE = 'FOOD_NURSING_SWITCH_SIDE';
export const TYPE_REMAINING_TIME_SEC = 'FOOD_NURSING_REMAINING_TIME_SEC';

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

export function switchSides(): Action {
  return {
    type: 'FOOD_NURSING_SWITCH_SIDE',
  };
}

export function updateTimeRemaining(timeRemainingSec: number): Action {
  return {
    type: 'FOOD_NURSING_REMAINING_TIME_SEC',
    payload: {
      timeRemainingSec,
    },
  };
}
