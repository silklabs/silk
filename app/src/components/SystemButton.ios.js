import React from 'react';
import { NativeModules, requireNativeComponent } from 'react-native';

const { SystemButtonManager } = NativeModules;
const SystemButtonNative = requireNativeComponent('SystemButton');

export default class SystemButton extends React.Component {

  static propTypes = {
    // Configuration
    type: React.PropTypes.oneOf(
      Object.keys(SystemButtonManager).map(key => SystemButtonManager[key])),
    enabled: React.PropTypes.bool,
    onPress: React.PropTypes.func,
    color: React.PropTypes.string,
  };

  render() {
    return (
      <SystemButtonNative {...this.props} />
    );
  }
}

// Re-export constants...
for (let key in SystemButtonManager) {
  SystemButton[key] = SystemButtonManager[key];
}
