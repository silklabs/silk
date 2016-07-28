/**
 * @flow
 */

import invariant from 'assert';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  StyleSheet,
  Image,
  View,
} from 'react-native';

/* eslint-disable camelcase */

// We can't perform the require() programmatically, so we need to
// build this list ahead of time.
const WIFI_NETWORK_ICONS = {
  weak_light_small: require('../../assets/wifi_signal_weak_light_small.png'),
  medium_light_small: require('../../assets/wifi_signal_medium_light_small.png'),
  strong_light_small: require('../../assets/wifi_signal_strong_light_small.png'),

  weak_dark_small: require('../../assets/wifi_signal_weak_dark_small.png'),
  medium_dark_small: require('../../assets/wifi_signal_medium_dark_small.png'),
  strong_dark_small: require('../../assets/wifi_signal_strong_dark_small.png'),

  weak_light_large: require('../../assets/wifi_signal_weak_light_large.png'),
  medium_light_large: require('../../assets/wifi_signal_medium_light_large.png'),
  strong_light_large: require('../../assets/wifi_signal_strong_light_large.png'),

  secured_light_small: require('../../assets/wifi_secured_light_small.png'),
  secured_dark_small: require('../../assets/wifi_secured_dark_small.png'),
  secured_light_large: require('../../assets/wifi_secured_light_large.png'),
};

/* eslint-enable camelcase */

const MEDIUM_THRESHOLD = -75;
const STRONG_THRESHOLD = -50;

export default class WifiNetworkIcon extends React.Component {

  static propTypes = {
    level: React.PropTypes.number.isRequired,
    secured: React.PropTypes.bool,
    size: React.PropTypes.oneOf(['small', 'large']).isRequired,
    tint: React.PropTypes.oneOf(['dark', 'light']).isRequired,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  _renderLevel() {
    const { level, size, tint } = this.props;
    let strength = 'weak';
    if (level > MEDIUM_THRESHOLD) {
      strength = 'medium';
    }
    if (level > STRONG_THRESHOLD) {
      strength = 'strong';
    }
    const imageSource = WIFI_NETWORK_ICONS[`${strength}_${tint}_${size}`];
    invariant(imageSource);
    return (
      <Image
        source={imageSource}
        style={styles[size]}
      />
    );
  }

  _renderSecured() {
    const { size, tint } = this.props;
    const imageSource = WIFI_NETWORK_ICONS[`secured_${tint}_${size}`];
    invariant(imageSource);
    return (
      <Image
        source={imageSource}
        style={[styles[size], size === 'small' ? styles.secured : null]}
      />
    );
  }

  render() {
    if (!this.props.secured) {
      return this._renderLevel();
    }
    return (
      <View style={styles.icons}>
        {this._renderSecured()}
        {this._renderLevel()}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  icons: {
    flexDirection: 'row',
  },
  secured: {
    marginRight: 2,
  },
  small: {
    width: 16,
    height: 16,
  },
  large: {
    width: 32,
    height: 32,
  },
});
