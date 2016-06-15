/**
 * @flow
 */

/**
 * These action types must be unique throughout the system so they are prefixed
 * with the directory name.
 */
export const TYPE_ADD = 'BABIES_ADD';
export const TYPE_RENAME = 'BABIES_RENAME';
export const TYPE_RESET_BABIES = 'RESET_BABIES';

// Flow needs these as string literals so we can't use the consts above... Grr.
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

// Creates an action that adds a baby to our list.
export function addBaby(id: string, name: string): Action {
  return {
    type: TYPE_ADD,
    payload: {
      id,
      name,
    },
  };
}

// Creates an action that renames a baby in our list.
export function renameBaby(id: string, name: string): Action {
  return {
    type: TYPE_RENAME,
    payload: {
      id,
      name,
    },
  };
}

// Creates an action that will remove all babies from our list.
export function resetBabies(): Action {
  return {
    type: TYPE_RESET_BABIES,
  };
}
