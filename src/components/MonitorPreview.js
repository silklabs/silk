/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';

import PreviewQueue from '../libraries/PreviewQueue';

import ImageView from './ImageView';
import ObjectBoxes from './ObjectBoxes';

var {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

class MonitorLabel extends React.Component {
  render() {
    return (
      <View style={styles.monitorLabelContainer}>
        <Text style={styles.monitorLabel}>{this.props.children}</Text>
      </View>
    );
  }
}

export class MonitorConnecting extends React.Component {
  render() {
    let status = this.props.status === '' ? '' : `(${this.props.status})`;
    return (
      <View style={styles.monitorContainer}>
        <MonitorLabel>Connecting device ... {status}</MonitorLabel>
        <View style={styles.monitorPreviewContainer}>
          <View style={styles.placeholderPreview} />
        </View>
      </View>
    );
  }
}

export var MonitorPreview = React.createClass({
  propTypes: {
    deviceId: React.PropTypes.string.isRequired,
    label: React.PropTypes.string.isRequired,
    status: React.PropTypes.string.isRequired,
    navigator: React.PropTypes.object.isRequired,
    socket: React.PropTypes.object.isRequired,
    api: React.PropTypes.object.isRequired,
    logo: React.PropTypes.object.isRequired,
  },

  getInitialState() {
    return {
      objects: [],
      previewWidth: null,
    };
  },

  onPreviewFrame(message) {
    this._queue.push(message);
  },

  componentWillMount() {
    let { socket, deviceId } = this.props;

    this._queue = new PreviewQueue(this.props.label, message => {
      this.setState({
        blob: message.frame,
        objects: message.objects || [],
      });
    });

    let stream = `preview-${deviceId}`;
    socket.on(stream, this.onPreviewFrame);
    socket.join(stream);
  },

  componentWillUnmount() {
    let { socket, deviceId } = this.props;
    let stream = `preview-${deviceId}`;
    socket.off(stream, this.onPreviewFrame);
    socket.leave(stream);
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
  },

  render() {
    let { deviceId } = this.props;
    let status = this.props.status === '' ? '' : `(${this.props.status})`;

    return (
      <View style={styles.monitorContainer}>
        <MonitorLabel>{this.props.label} {status}</MonitorLabel>
        {this._renderPreview()}
      </View>
    );
  },

  _renderPreview() {
    if (this.state.previewWidth === null) {
      // Measure layout so we know how large to display the preview images.
      return (
        <View
          onLayout={(event) => this.setState({previewWidth: event.nativeEvent.layout.width})}
          style={styles.monitorPreviewPlaceholder}
        />
      );
    }

    let { previewSize } = this.props;
    let previewStyle = {
      width: this.state.previewWidth,
      height: previewSize.height * this.state.previewWidth / previewSize.width,
    };

    let logo = null;
    if (this.props.logo) {
      logo = (
        <ImageView
          style={styles.logo}
          blob={this.props.logo}
        />
      );
    }

    let objects = null;
    if (this.state.objects.length) {
      objects = (
        <ObjectBoxes
          deviceId={this.props.deviceId}
          socket={this.props.socket}
          width={previewStyle.width}
          height={previewStyle.height}
          objects={this.state.objects}
          previewSize={previewSize}
        />
      );
    }

    return (
      <TouchableOpacity
        onPress={this.props.onPress}
        style={[styles.monitorPreviewContainer, previewStyle]}>
        <ImageView style={styles.preview} blob={this.state.blob} />
        {logo}
        <View style={styles.monitorPreviewOverlay}>
          {objects}
        </View>
      </TouchableOpacity>
    );
  },
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
    paddingBottom: 5,
  },
  monitorLabel: {
    fontFamily: 'Open Sans',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#3a3a48',
    textAlign: 'left',
  },

  monitorPreviewPlaceholder: {
    flex: 1,
  },

  monitorPreviewContainer: {
    backgroundColor: 'white',
    flex: 1,
  },

  preview: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  placeholderPreview: {
    flex: 1,
    backgroundColor: 'gray',
  },

  logo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 15,
    opacity: 0.5,
  },

  monitorPreviewOverlay: {
    backgroundColor: 'transparent',
  },
});
