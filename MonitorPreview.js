/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native';
import LiveVideo from './LiveVideo'
import PreviewImage from './PreviewImage'
import MonitorFullscreen from './MonitorFullscreen'

var {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;


var PREVIEW_WIDTH = 305;
var PREVIEW_HEIGHT = 170;

var MonitorPreview = React.createClass({
  getInitialState() {
    return {
      showVideo: false
    }
  },

  showVideo() {
    this.setState({ showVideo: true })
  },

  onVideoHidden() {
    this.setState({ showVideo: false })
  },

  render() {
    var vid = this.props.vid;
    var fullscreen = this.state.showVideo;

    return (
      <TouchableOpacity onPress={this.showVideo}>
        <View style={styles.monitorContainer}>
          <MonitorFullscreen
            onClose={this.onVideoHidden}
            presented={fullscreen}
            vid={vid} />
          <View style={styles.monitorLabelContainer}>
            <Text style={styles.monitorLabel}>{this.props.label}</Text>
          </View>
          <MonitorPreviewStream vid={this.props.vid}
                                serverUrl={this.props.serverUrl}/>
        </View>
      </TouchableOpacity>
    );
  }
});

// This will become a native-backed (or initially, WebView-backed)
// widget that streams video in small format.
var MonitorPreviewStream = React.createClass({
  render: function() {
    // TODO: scrollEnabled={false}
    let stream = `video-preview-${this.props.vid}`
    return (
      <View style={styles.monitorPreview}>
        <PreviewImage stream={stream} />
      </View>
    );
  }
});

var styles = StyleSheet.create({
  monitorContainer: {
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
