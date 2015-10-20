import React from 'react-native';

import Config from '../../libraries/Config';

import { FormStyles, LayoutStyles } from '../CommonStyles';

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

const SERVERS = [
  {name: 'default', value: null},
  {name: 'master', value: 'https://silk-server-master.herokuapp.com'},
  {name: 'next', value: 'https://silk-server-next.herokuapp.com'},
  {name: 'release', value: 'https://silk-server-release.herokuapp.com'},
  {name: 'localhost', value: 'http://localhost:5000'},
];
let { scriptURL } = NativeModules.SourceCode;
let match = scriptURL && scriptURL.match(/^https?:\/\/(.*?)\//);
if (match && match[1]) {
  let bundleHost = match[1];
  if (bundleHost.indexOf(':') !== -1) {
    bundleHost = bundleHost.split(':')[0];
  }
  if (bundleHost !== 'localhost') {
    SERVERS.push({
      name: `JS bundle host (${bundleHost})`,
      value: `http://${bundleHost}:5000`,
    });
  }
}

export default class extends React.Component {

  state = {
    serverUrl: Config.get().server.url || null,
  };

  _renderTitle() {
    return (
      <View style={styles.titleContainer}>
        <View style={styles.spacer}>
          <TouchableOpacity onPress={this.cancel}>
            <View style={styles.titleButton}>
              <Text style={styles.cancel}>Cancel</Text>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Server</Text>
        <View style={styles.spacer}>
          <TouchableOpacity onPress={this.save}>
            <View style={styles.titleButton}>
              <Text style={styles.save}>Save</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  _renderServerPicker() {
    let haveCustomServer = true;
    let servers = SERVERS.map((server, index) => {
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
        serverUrl.indexOf('http://') !== 0 &&
        serverUrl.indexOf('https://') !== 0) {
      serverUrl = 'http://' + serverUrl;
    }
    Config.set({server: {url: serverUrl}});
    // Root view will take care of the rest.
  };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f4f4f6',
    flex: 1,
  },
  titleContainer: {
    justifyContent: 'center',
    flexDirection: 'row',
    paddingTop: 2,
  },
  spacer: {
    flex: 1,
  },
  title: {
    color: 'black',
    fontSize: 17,
    textAlign: 'center',
    fontWeight: '500',
    paddingTop: 8,
  },
  titleButton: {
    padding: 8,
  },
  save: {
    color: '#007aff',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'right',
  },
  cancel: {
    color: '#007aff',
    fontSize: 17,
    textAlign: 'left',
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
