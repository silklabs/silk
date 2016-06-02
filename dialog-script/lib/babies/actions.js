/**
 * Copyright (c) 2015-2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

export const TYPE_ADD = 'BABIES_ADD';
export const TYPE_RENAME = 'BABIES_RENAME';
export const TYPE_RESET_BABIES = 'RESET_BABIES';

export type Action =
  {
    type: 'BABIES_ADD' | 'BABIES_RENAME';
    payload: {
      id: number;
      name: string;
    };
  } | {
    type: 'RESET_BABIES';
  }
;

export function addBaby(id: number, name: string): Action {
  return {
    type: TYPE_ADD,
    payload: {
      id,
      name,
    },
  };
}

export function renameBaby(id: number, name: string): Action {
  return {
    type: TYPE_RENAME,
    payload: {
      id,
      name,
    },
  };
}

export function resetBabies(): Action {
  return {
    type: TYPE_RESET_BABIES,
  };
}
