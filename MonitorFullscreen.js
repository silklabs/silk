/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native'
import WebViewBridge from 'react-native-webview-bridge'
import LiveVideo from './LiveVideo'

let {
  Image,
  StatusBarIOS,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} = React;

export default React.createClass({
  componentDidMount: function() {
    var statusBarAnimation = 'slide';
    StatusBarIOS.setHidden(true, statusBarAnimation);
  },

  render: function() {
    var videoStream = {
      server: `http://${this.props.serverUrl}`,
      id: this.props.vid
    };

    return (
      <TouchableWithoutFeedback onPress={this.popNav}>
        <View style={styles.container}>
          <LiveVideo videoStream={videoStream} ref='video' />
        </View>
      </TouchableWithoutFeedback>
    );
  },

  popNav: function() {
    StatusBarIOS.setHidden(false, 'slide');
    this.props.navigator.pop();
    var video = this.refs.video;
    if (video) {
      video.destroy()
    }
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    backgroundColor: 'black',
  },
});
