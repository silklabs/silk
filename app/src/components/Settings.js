/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native';

import { UserState } from '../libraries/UserState';

import AsyncComponent from './AsyncComponent';
import { FormStyles, LayoutStyles, TitleBarStyles } from './CommonStyles';

let {
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  TouchableOpacity,
  View,
} = React;

const MIN_CONTENT_INSET_BOTTOM = 20;

export default class WifiSettings extends AsyncComponent {

  static propTypes = {
    userState: React.PropTypes.instanceOf(UserState).isRequired,
  };

 _renderTitleBar() {
    return (
      <View style={TitleBarStyles.titleBar}>
        <TouchableOpacity
          onPress={this._goBack}
          style={TitleBarStyles.titleBarLeftButton}>
          <Text style={TitleBarStyles.titleBarButtonLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={TitleBarStyles.titleBarLabel}>Settings</Text>
      </View>
    );
  }

  _renderAccountSettings() {
    return (
      <View
        style={FormStyles.form}>
        <TouchableHighlight
          underlayColor="lightgrey"
          onPress={this.signOut}
          style={[FormStyles.formRow, FormStyles.formRowFirst]}>
          <Text style={FormStyles.formButtonLabel}>
            Sign Out
          </Text>
        </TouchableHighlight>
      </View>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        <View style={LayoutStyles.statusBarPlaceholder} />
        {this._renderTitleBar()}

        <ScrollView
          keyboardShouldPersistTaps={false}
          contentInset={{bottom: MIN_CONTENT_INSET_BOTTOM}}
          style={styles.scrollView}>
          <Text style={FormStyles.formHeader}>ACCOUNT</Text>
          {this._renderAccountSettings()}
        </ScrollView>
      </View>
    );
  }

  _goBack = () => {
    this.props.navigator.popAsync();
  };

  signOut = async () => {
    await this.props.userState.signOut();
  };

}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4f4f6',
    flex: 1,
  },
  scrollView: {
    backgroundColor: '#efeff4',
    borderColor: '#a7a7aa',
    borderTopWidth: 1 / PixelRatio.get(),
    flex: 1,
  },
});
