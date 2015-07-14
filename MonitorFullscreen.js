/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  Image,
  StatusBarIOS,
  StyleSheet,
  Text,
  View,
} = React;

var WebViewBridge = require('react-native-webview-bridge');
var LiveVideo = require('./LiveVideo');

var MonitorFullscreen = React.createClass({
  componentDidMount: function() {
    var statusBarAnimation = 'slide';
    var video = this.refs.video;

    StatusBarIOS.setHidden(true, statusBarAnimation);
  },

  render: function() {
    var videoStream = {
      server: `http://${this.props.serverUrl}`,
      id: this.props.vid
    };

    return (
      <View style={styles.container}>
        <LiveVideo videoStream={videoStream} ref='video' />
      </View>
    );
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch'
  },
});

module.exports = MonitorFullscreen;
