import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import { StyleSheet, Text, View } from 'react-native';

import Button from './setup/Button';
import { Colors, SetupStyles } from './CommonStyles';
import { DeviceSession } from '../libraries/ble/DeviceManager';

export default class UnconfiguredDevice extends React.Component {

  static propTypes = {
    bleDeviceSession: React.PropTypes.instanceOf(DeviceSession),
  };

  static contextTypes = {
    silkDevices: React.PropTypes.object.isRequired,
  };

  state = {
    ignored: false,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  componentWillReceiveProps(nextProps) {
    if (nextProps.bleDeviceSession !== this.props.bleDeviceSession) {
      this.setState({ignored: false});
    }
  }

  render() {
    // Crude way of "ignoring" a device for now. If we reconnect,
    // it'll come back.
    if (this.state.ignored) {
      return <View />;
    }
    return (
      <View style={[styles.container, this.props.style]}>
        <Text style={SetupStyles.title}>
          New Device Found
        </Text>
        <View style={styles.buttonRow}>
          <Button
            type="secondary"
            style={styles.ignoreButton}
            label="Ignore"
            onPress={this._doIgnore}
          />
          <Button
            type="primary"
            style={styles.addButton}
            label="Add"
            onPress={this._doConfigure}
          />
        </View>
      </View>
    );
  }

  _doIgnore = () => {
    this.setState({ignored: true});
  };

  _doConfigure = () => {
    this.context.silkDevices.configureDevice(this.props.bleDeviceSession);
  };

}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.SilkLabsGreen,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 14,
    borderColor: 'white',
    borderWidth: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 10,
    flex: 1,
  },
  ignoreButton: {
    marginRight: 8,
  },
  addButton: {
    marginLeft: 8,
  },
});
