/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  Image,
  StyleSheet,
  Text,
  View,
} = React;

var WebViewBridge = require('react-native-webview-bridge');

var MonitorFullscreen = React.createClass({
  componentDidMount: function() {
    var webview = this.refs.webview;
    webview.onMessage(msg => {
      if (msg != 'done') {
        console.log('Received unknown message from WebView:', msg);
        return;
      }
      console.log('Popping out of fullscreen');
      this.props.navigator.pop();
    });
    webview.send({ id: this.props.vid,
                   serverUrl: 'http://'+ this.props.serverUrl });
  },

  render: function() {
    return (
      <View style={styles.container}>
        <WebViewBridge ref='webview'
                       url='web/monitor-stream.html'
                       bounces={false} />
      </View>
    );
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

module.exports = MonitorFullscreen;
