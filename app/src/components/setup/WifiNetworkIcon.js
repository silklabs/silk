import React from 'react';
import {
  StyleSheet,
  Image,
  View,
} from 'react-native';

/* eslint-disable camelcase */

// We can't perform the require() programmatically, so we need to
// build this list ahead of time.
const WIFI_NETWORK_ICONS = {
  weak_light_small: require('image!wifi_signal_weak_light_small'),
  medium_light_small: require('image!wifi_signal_medium_light_small'),
  strong_light_small: require('image!wifi_signal_strong_light_small'),
  weak_dark_small: require('image!wifi_signal_weak_dark_small'),
  medium_dark_small: require('image!wifi_signal_medium_dark_small'),
  strong_dark_small: require('image!wifi_signal_strong_dark_small'),
};

/* eslint-enable camelcase */

const MEDIUM_THRESHOLD = -75;
const STRONG_THRESHOLD = -50;

export default class WifiNetworkIcon extends React.Component {

  static propTypes = {
    level: React.PropTypes.number.isRequired,
    size: React.PropTypes.oneOf(['small', 'large']).isRequired,
    tint: React.PropTypes.oneOf(['dark', 'light']).isRequired,
  };

  render() {
    const { level, size, tint } = this.props;
    let strength = 'weak';
    if (level > MEDIUM_THRESHOLD) {
      strength = 'medium';
    }
    if (level > STRONG_THRESHOLD) {
      strength = 'strong';
    }
    const imageSource = WIFI_NETWORK_ICONS[`${strength}_${tint}_${size}`];
    if (!imageSource) {
      return <View />;
    }
    return (
      <Image
        source={imageSource}
        style={styles[size]}
      />
    );
  }
}

const styles = StyleSheet.create({
  small: {
    width: 16,
    height: 16,
  },
  large: {
    width: 32,
    height: 32,
  },
});
