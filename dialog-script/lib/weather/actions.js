/**
 * @flow
 */

export const TYPE_UPDATE_ZIPCODE = 'WEATHER_UPDATE_ZIPCODE';
export const TYPE_RESET_ZIPCODE = 'WEATHER_RESET_ZIPCODE';

// Flow needs these as string literals so we can't use the consts above... Grr.
export type Action =
  {
    type: 'WEATHER_UPDATE_ZIPCODE',
    payload: {
      zipcode: number;
    };
  } | {
    type: 'WEATHER_RESET_ZIPCODE'
  }
;

// Creates an action that updates the zipcode
export function updateZipcode(zipcode: number): Action {
  return {
    type: TYPE_UPDATE_ZIPCODE,
    payload: {
      zipcode,
    },
  };
}

// Creates an action that resets the zipcode
export function clearZipcode(): Action {
  return {
    type: TYPE_RESET_ZIPCODE,
  };
}

