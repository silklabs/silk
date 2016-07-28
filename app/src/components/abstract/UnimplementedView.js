/**
 * @flow
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Based on React Native's internal UnimplementeView
 */
export default class UnimplementedView extends React.Component {

  setNativeProps() {
    // This method is required in order to use this view as a Touchable* child.
    // See ensureComponentIsNative.js for more info
  }

  render() {
    return (
      <View style={[styles.unimplementedView, this.props.style]}>
        {this.props.children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  unimplementedView: {
    borderWidth: 1,
    borderColor: 'red',
    alignSelf: 'flex-start',
  },
});
