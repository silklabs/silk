/**
 * @flow
 */

export const TYPE_UPDATE_LOCATION = 'WEATHER_UPDATE_LOCATION';
export const TYPE_RESET_LOCATION = 'WEATHER_RESET_LOCATION';

// Flow needs these as string literals so we can't use the consts above... Grr.
export type Action =
  {
    type: 'WEATHER_UPDATE_LOCATION',
    payload: {
      location: number | string;
    };
  } | {
    type: 'WEATHER_RESET_LOCATION',
  }
;

// Creates an action that updates the location
export function updateLocation(location: number | string): Action {
  return {
    type: TYPE_UPDATE_LOCATION,
    payload: {
      location,
    },
  };
}

// Creates an action that resets the location
export function clearLocation(): Action {
  return {
    type: TYPE_RESET_LOCATION,
  };
}

