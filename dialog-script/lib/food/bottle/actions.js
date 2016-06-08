/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

export const TYPE_BOTTLE_TYPE = 'FOOD_BOTTLE_TYPE';
export const TYPE_BOTTLE_AMOUNT = 'FOOD_BOTTLE_AMOUNT';

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

export function bottleType(type: 'formula' | 'milk'): Action {
  return {
    type: 'FOOD_BOTTLE_TYPE',
    payload: {
      type,
    },
  };
}

export function bottleAmount(amountMl: number): Action {
  return {
    type: 'FOOD_BOTTLE_AMOUNT',
    payload: {
      amountMl,
    },
  };
}
