import React from 'react-native';

import Config from '../../libraries/Config';

import { FormStyles, LayoutStyles, TitleBarStyles } from '../CommonStyles';

let {
  Image,
  NativeModules,
  PixelRatio,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  View,
} = React;

export default class extends React.Component {

  state = {
    serverUrl: Config.get().serverUrl,
  };

  _renderTitle() {
    let saveButtonLabel = (
      <Text style={TitleBarStyles.titleBarButtonLabel}>Save</Text>
    );
    let saveButton;
    if (this.state.serverUrl === Config.get().serverUrl) {
      saveButton = (
        <View style={[TitleBarStyles.titleBarRightButton, styles.disabledButton]}>
          {saveButtonLabel}
        </View>
      );
    } else {
      saveButton = (
        <TouchableOpacity
          onPress={this.save}
          style={TitleBarStyles.titleBarRightButton}>
          {saveButtonLabel}
        </TouchableOpacity>
      );
    }
    return (
      <View style={TitleBarStyles.titleBar}>
        <TouchableOpacity
          onPress={this.cancel}
          style={TitleBarStyles.titleBarLeftButton}>
            <Text style={TitleBarStyles.titleBarButtonLabel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={TitleBarStyles.titleBarLabel}>Server</Text>
        {saveButton}
      </View>
    );
  }

  _getServerChoices() {
    let { choices, devChoices } = Config.get().server;
    let { showDevServers } = Config.get();

    if (showDevServers) {
      choices = choices.concat(devChoices);
    }

    // In dev builds where the bundle is loaded from a JS server,
    // offer that host as an option too. It's pretty common to be
    // running a JS bundle server and a Silk server on the same
    // development host.
    if (!__DEV__) { /* eslint no-undef: 0 */
      return choices;
    }
    let { scriptURL } = NativeModules.SourceCode;
    let match = scriptURL && scriptURL.match(/^https?:\/\/(.*?)\//);
    if (!match || !match[1]) {
      return choices;
    }
    let bundleHost = match[1];
    if (bundleHost.indexOf(':') !== -1) {
      bundleHost = bundleHost.split(':')[0];
    }
    if (bundleHost === 'localhost') {
      return choices;
    }
    choices = choices.slice();
    choices.push({
      name: `JS bundle host (${bundleHost})`,
      value: `http://${bundleHost}:5000`,
    });
    return choices;
  }

  _renderServerPicker() {
    let haveCustomServer = true;
    let servers = this._getServerChoices().map((server, index) => {
      let checkmark = null;
      if (server.value === this.state.serverUrl) {
        checkmark = (
          <Image
            source={require('image!Checkmark')}
            style={styles.checkmark}
          />
        );
        haveCustomServer = false;
      }
      let style = index === 0 ? [FormStyles.formRow, FormStyles.formRowFirst] : FormStyles.formRow;
      return (
        <TouchableHighlight
          underlayColor="lightgrey"
          onPress={() => this.setState({serverUrl: server.value})}>
          <View
            style={style}
            key={server.name}>
            <View style={FormStyles.formRowLabelContainer}>
              <Text style={FormStyles.formRowLabel}>{server.name}</Text>
            </View>
            {checkmark}
          </View>
        </TouchableHighlight>
      );
    });

    let customCheckmark = null;
    if (haveCustomServer) {
      customCheckmark = (
        <Image
          source={require('image!Checkmark')}
          style={styles.checkmark}
        />
      );
    }
    return (
      <View style={styles.servers}>
        {servers}
        <View style={FormStyles.formRow}>
          <View style={FormStyles.formInputContainer}>
            <TextInput
              ref="serverUrl"
              value={haveCustomServer ? this.state.serverUrl : null}
              placeholder="Enter a custom URL"
              autoCapitalize="none"
              autoCorrect={false}
              style={FormStyles.formInput}
              onChangeText={(serverUrl) => this.setState({serverUrl})}
            />
          </View>
          {customCheckmark}
        </View>
      </View>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        <View style={LayoutStyles.statusBarPlaceholder} />
        {this._renderTitle()}
        {this._renderServerPicker()}
      </View>
    );
  }

  cancel = () => {
    this.props.navigator.popAsync();
  };

  save = () => {
    let { serverUrl } = this.state;
    if (typeof serverUrl === 'string' &&
        serverUrl.length > 0 &&
        serverUrl.indexOf('http://') !== 0 &&
        serverUrl.indexOf('https://') !== 0) {
      serverUrl = 'http://' + serverUrl;
    }
    Config.set({serverUrl});
    // Root view will take care of the rest.
  };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4f4f6',
    flex: 1,
  },
  disabledButton: {
    opacity: 0.5,
  },

  servers: {
    backgroundColor: 'white',
    borderColor: '#a7a7aa',
    borderTopWidth: 1 / PixelRatio.get(),
  },
  checkmark: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
});
