/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
import LiveVideo from './LiveVideo'
import ImageView from './ImageView'
import MonitorFullscreen from './MonitorFullscreen'
import ObjectBoxes from './ObjectBoxes';

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
  propTypes: {
    id: React.PropTypes.string.isRequired,
    label: React.PropTypes.string.isRequired,
    serverUrl: React.PropTypes.string.isRequired,
    navigator: React.PropTypes.object.isRequired,
    socket: React.PropTypes.object.isRequired,
    api: React.PropTypes.object.isRequired,
    logo: React.PropTypes.object.isRequired
  },

  getInitialState() {
    return {
      showVideo: false,
      objects: []
    }
  },

  showVideo() {
    this.setState({ showVideo: true })
  },

  onVideoHidden() {
    this.setState({ showVideo: false })
  },

  onPreviewFrame(message) {
    this.setState({
      blob: message.frame,
      objects: message.objects || []
    });
  },

  componentWillMount() {
    let { socket, id } = this.props;
    let stream = `video-preview-${id}`;
    socket.on(stream, this.onPreviewFrame);
    socket.join(stream);
  },

  componentWillUnmount() {
    let { socket, id } = this.props;
    let stream = `video-preview-${id}`;
    socket.off(stream, this.onPreviewFrame);
    socket.leave(stream);
  },

  render() {
    let id = this.props.id;
    let fullscreen = this.state.showVideo;
    let objects = null;

    if (this.state.objects.length) {
      objects = (
        <ObjectBoxes
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          objects={this.state.objects}
          previewSize={this.props.previewSize}/>
      );
    }

    let logo = null;
    if (this.props.logo) {
      logo = (
        <ImageView
          style={styles.logo}
          blob={this.props.logo} />
      );
    }

    return (
      <TouchableOpacity onPress={this.showVideo}>
        <View style={styles.monitorContainer}>
          <MonitorFullscreen
            api={this.props.api}
            onClose={this.onVideoHidden}
            presented={fullscreen}
            socket={this.props.socket}
            id={id}
            previewSize={this.props.previewSize} />
          <View style={styles.monitorLabelContainer}>
            <Text style={styles.monitorLabel}>Cam Name</Text>
          </View>
          <View style={styles.monitorPreviewContainer}>
            <ImageView style={styles.preview} blob={this.state.blob} />
            {logo}
            <View style={styles.monitorPreviewOverlay}>
              {objects}
            </View>
          </View>
        </View>
      </TouchableOpacity>
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
    fontFamily: 'Open Sans',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#3a3a48',
    textAlign: 'left',
  },
  
  monitorPreviewContainer: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    backgroundColor: 'white',
    flex: 1
  },

  preview: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  logo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 15,
    opacity: 0.5
  },

  monitorPreviewOverlay: {
    backgroundColor: 'transparent'
  },
});

module.exports = MonitorPreview;
