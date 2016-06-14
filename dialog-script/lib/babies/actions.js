/**
 * @flow
 */

export const TYPE_ADD = 'BABIES_ADD';
export const TYPE_RENAME = 'BABIES_RENAME';
export const TYPE_RESET_BABIES = 'RESET_BABIES';

export type Action =
  {
    type: 'BABIES_ADD' | 'BABIES_RENAME';
    payload: {
      id: string;
      name: string;
    };
  } | {
    type: 'RESET_BABIES';
  }
;

export function addBaby(id: string, name: string): Action {
  return {
    type: TYPE_ADD,
    payload: {
      id,
      name,
    },
  };
}

export function renameBaby(id: string, name: string): Action {
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
