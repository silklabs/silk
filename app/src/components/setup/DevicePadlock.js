import React from 'react';
import {
  StyleSheet,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent.js';
import { LayoutStyles, TitleBarStyles } from '../CommonStyles';

export default class DevicePadlock extends AsyncComponent {

  static propTypes = {
    onCancel: React.PropTypes.func.isRequired,
    onSave: React.PropTypes.func.isRequired,
  };

  render() {
    return (
      <View style={styles.container}>
        <View style={LayoutStyles.statusBarPlaceholder} />
        <View style={TitleBarStyles.titleBar}>
          <TouchableOpacity
            onPress={this.props.onCancel}
            style={TitleBarStyles.titleBarLeftButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={TitleBarStyles.titleBarLabel}>Device Setup</Text>
          <TouchableOpacity
            onPress={this._onNext}
            style={TitleBarStyles.titleBarRightButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Next</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.contentContainer}>
          <Text style={styles.label}>
            Success! Let's configure your new device!
          </Text>
          <Image source={require('image!padlock')} style={styles.padlock} />
        </View>
      </View>
    );
  }

  _onNext = () => {
    this.props.navigator.pushAsync({
      name: 'DeviceConfig',
      props: this.props,
    });
  };

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#424242',
    fontSize: 20,
    marginHorizontal: 50,
    marginBottom: 50,
    textAlign: 'center',
  },
  padlock: {
    width: 190,
    height: 190,
  },
});
