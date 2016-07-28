/**
 * @flow
 */

import React from 'react';
import {View} from 'react-native';

import AsyncComponent from './abstract/AsyncComponent';
import ErrorBar from './ErrorBar';

import type {GlobalProps} from './Root';

/**
 * Autonomous component that detects when there's no network availability and
 * displays a warning box.
 */
export default class NetworkWarning extends AsyncComponent {

  props: GlobalProps;

  shouldComponentUpdate(nextProps: GlobalProps): boolean {
    return nextProps.network !== this.props.network;
  }

  render() {
    if (this.props.network.canReachServer) {
      return <View />;
    }
    return (
      <ErrorBar
        heading="Network Connection Unavailable"
        description="Please check your data or WiFi connection."
      />
    );
  }
}
