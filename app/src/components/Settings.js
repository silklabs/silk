/**
 * @flow
 */

import moment from 'moment';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  TouchableOpacity,
  View,
} from 'react-native';
import silkVersion from 'silk-core-version';

import * as actions from '../store/actions';
import AsyncComponent from './abstract/AsyncComponent';
import { FormStyles, LayoutStyles, TitleBarStyles } from './CommonStyles';

import type {GlobalProps} from './Root';

const MIN_CONTENT_INSET_BOTTOM = 20;

export default class WifiSettings extends AsyncComponent {

  props: GlobalProps;

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

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
      <View style={FormStyles.form}>
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

  _renderVersion() {
    let buildDate = new Date(parseInt(silkVersion.buildtime, 0));

    let devBuild = null;
    if (!silkVersion.official) {
      devBuild = (
        <Text style={styles.formRowSublabel}>
          Development Build
        </Text>
      );
    }

    return (
      <View style={FormStyles.form}>
        <View style={styles.versionContainer}>
          <Text style={FormStyles.formRowLabel}>
            {silkVersion.semver}
          </Text>
          <Text style={styles.formRowSublabel}>
            Commit: {silkVersion.sha.slice(0, 8)}
          </Text>
          <Text style={styles.formRowSublabel}>
            Date: {moment(buildDate).format('L LT')}
          </Text>
          {devBuild}
        </View>
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
          <Text style={FormStyles.formHeader}>VERSION</Text>
          {this._renderVersion()}
        </ScrollView>
      </View>
    );
  }

  _goBack = () => {
    this.props.navigator.popAsync();
  };

  signOut = () => {
    this.props.store.dispatch(actions.auth.signOut());
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
  formRowSublabel: {
    fontSize: 12,
  },
  versionContainer: {
    flex: 1,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 12,
  },
});
