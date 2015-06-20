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

var MonitorPreview = React.createClass({
  render: function() {
    return (
        <View style={styles.monitorContainer}>
          <View style={styles.monitorLabelContainer}>
            <Text style={styles.monitorLabel}>{this.props.label}</Text>
          </View>
          <MonitorPreviewStream />
      </View>
    );
  }
});

// This will become a native-backed (or initially, WebView-backed)
// widget that streams video in small format.
var MonitorPreviewStream = React.createClass({
  render: function() {
    return (
        <View style={styles.monitorPreview}></View>
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
    width: 305,
    height: 170,
    backgroundColor: '#888888',
  },
});

module.exports = MonitorPreview;
