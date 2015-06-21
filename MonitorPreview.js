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

var PREVIEW_WIDTH = 305;
var PREVIEW_HEIGHT = 170;

var MonitorPreview = React.createClass({
  render: function() {
    return (
        <View style={styles.monitorContainer}>
          <View style={styles.monitorLabelContainer}>
            <Text style={styles.monitorLabel}>{this.props.label}</Text>
          </View>
          <MonitorPreviewStream vid={this.props.vid}
                                serverUrl={this.props.serverUrl}/>
      </View>
    );
  }
});

// This will become a native-backed (or initially, WebView-backed)
// widget that streams video in small format.
var MonitorPreviewStream = React.createClass({
  componentDidMount: function() {
    this.refs.webview.send({ id: this.props.vid,
                             serverUrl: 'http://'+ this.props.serverUrl,
                             width: PREVIEW_WIDTH,
                             height: PREVIEW_HEIGHT,
                             backgroundColor: '#888888' });
  },

  render: function() {
    // TODO: scrollEnabled={false}
    return (
        <View style={styles.monitorPreview}>
          <WebViewBridge ref='webview'
                         url='web/monitor-preview-stream.html'
                         bounces={false} />
        </View>
    );
  }
});

var styles = StyleSheet.create({
  monitorContainer: {
    // FIXME: drop shadow is broken in current react-native...
    shadowColor: 'black',
    shadowRadius: 2,
    shadowOpacity: 0.5,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    backgroundColor: 'white',
    paddingTop: 5,
    marginTop: 5,
    marginBottom: 5,
    marginLeft: 8,
    marginRight: 7,
    flex: 1,
  },
  monitorLabelContainer: {
    paddingLeft: 10,
    paddingBottom: 10,
  },
  monitorLabel: {
    color: '#656569',
    fontSize: 15,
    textAlign: 'left',
  },

  monitorPreview: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    backgroundColor: '#888888',
  },
});

module.exports = MonitorPreview;
