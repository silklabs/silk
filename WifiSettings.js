/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} = React;

var WifiSettings = React.createClass({
  getInitialState: function() {
    return { ssid: '', secret: '' };
  },
  
  render: function() {
    return (
      <View style={styles.container}>
        <Text>Settings</Text>
        <View style={styles.formRow}>
          <Text>Access Point</Text>
          <TextInput ref='ssid'
                     value={this.props.ssidHint || ''}
                     style={styles.input}
                     onChangeText={(text) => this.setState({ssid: text})}>
          </TextInput>
        </View>
        <View style={styles.formRow}>
          <Text>Password</Text>
          <TextInput ref='secret' password={true}
                     style={styles.input}
                     onChangeText={(text) => this.setState({secret: text})}>
          </TextInput>
        </View>
        <View style={styles.formRow}>
          <TouchableOpacity onPress={this.cancel}>
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={this.ok}>
            <Text>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  },

  cancel: function() {
    if (this.props.reject) {
      this.props.reject();
    }
    this.props.navigator.pop();
  },

  ok: function() {
    if (this.props.resolve) {
      this.props.resolve(this.state);
    }
    // TODO save wifi to persistent DB --- here or elsewhere?
    this.props.navigator.pop();
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 30,
  },
  formRow: {
    flexDirection: 'row',
  },
  input: {
    height: 26,
    borderWidth: 0.5,
    borderColor: '#0f0f0f',
    flex: 1,
    fontSize: 13,
    padding: 4,
  },
});

module.exports = WifiSettings;
