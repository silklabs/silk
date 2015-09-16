import { Dimensions } from 'react-native';

export function getLandscapeDimensions() {
  let deviceWidth = Dimensions.get('window').width;
  let deviceHeight = Dimensions.get('window').height;
  let dimensions = {};

  // Because the overlay modal is not an actual subview of the react root view
  // we must manually assign a height and width. For now we always render in
  // landscape so figure out what that means in height/width regardless of
  // the current orientation of the device.
  if (deviceWidth > deviceHeight) {
    // currently in landscape:
    dimensions.height = deviceHeight;
    dimensions.width = deviceWidth;
  } else {
    // currently in portrait (flip the values):
    dimensions.width = deviceHeight;
    dimensions.height = deviceWidth;
  }

  return dimensions;
}
