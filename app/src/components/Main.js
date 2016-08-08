/**
 * @flow
 */

import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import { Navigator, StyleSheet, View } from 'react-native';

import DeviceList from './DeviceList';
import NetworkWarning from './NetworkWarning';
import TopBar from './TopBar';

export default class Main extends React.Component {

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  render() {
    return (
      <View style={styles.container}>
        <TopBar {...this.props} />
        <View style={styles.content}>
          <NetworkWarning {...this.props} />
          <DeviceList {...this.props} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    position: 'absolute',
    top: Navigator.NavigationBar.Styles.General.TotalNavHeight,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
