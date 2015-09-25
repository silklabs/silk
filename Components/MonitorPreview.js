/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
import ImageView from './ImageView';
import MonitorFullscreen from './MonitorFullscreen';
import ObjectBoxes from './ObjectBoxes';
import moment from 'moment';

var {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

var PREVIEW_WIDTH = 305;
var PREVIEW_HEIGHT = 170;

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
    id: React.PropTypes.string.isRequired,
    label: React.PropTypes.string.isRequired,
    status: React.PropTypes.string.isRequired,
    serverUrl: React.PropTypes.string.isRequired,
    navigator: React.PropTypes.object.isRequired,
    socket: React.PropTypes.object.isRequired,
    api: React.PropTypes.object.isRequired,
    logo: React.PropTypes.object.isRequired,
  },

  getInitialState() {
    return {
      showVideo: false,
      videoStartTime: null,
      objects: [],
      events: null,
    };
  },

  showVideo(videoStartTime) {
    this.setState({ showVideo: true, videoStartTime });
  },

  onVideoHidden() {
    this.setState({ showVideo: false, videoStartTime: null });
  },

  onPreviewFrame(message) {
    this.setState({
      blob: message.frame,
      objects: message.objects || [],
    });
  },

  componentWillMount() {
    let { socket, id } = this.props;
    let stream = `preview-${id}`;
    socket.on(stream, this.onPreviewFrame);
    socket.join(stream);

    this.props.api.timeMeta.findInTimeInterval({
      deviceId: this.props.id,
      metaType: 'event',
      startTime: Date.now() - 86400000,
      endTime: Date.now(),
      // TODO this is just to demo this feature. We really want a
      // batching API, and a different UI of course.
      maxCount: 3,
    }).then((events) => this.setState({events}));
  },

  componentWillUnmount() {
    let { socket, id } = this.props;
    let stream = `preview-${id}`;
    socket.off(stream, this.onPreviewFrame);
    socket.leave(stream);
  },

  render() {
    let id = this.props.id;
    let objects = null;

    if (this.state.objects.length) {
      objects = (
        <ObjectBoxes
          id={this.props.id}
          socket={this.props.socket}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          objects={this.state.objects}
          previewSize={this.props.previewSize}
        />
      );
    }

    let logo = null;
    if (this.props.logo) {
      logo = (
        <ImageView
          style={styles.logo}
          blob={this.props.logo}
        />
      );
    }

    let status = this.props.status === '' ? '' : `(${this.props.status})`;

    let fullScreenMonitor = null;
    let fullscreen = this.state.showVideo;
    if (fullscreen) {
      fullScreenMonitor = (
        <MonitorFullscreen
          api={this.props.api}
          onClose={this.onVideoHidden}
          socket={this.props.socket}
          id={id}
          previewSize={this.props.previewSize}
          startAtTime={this.state.videoStartTime}
        />
      );
    }
    return (
      <View style={styles.monitorContainer}>
        {fullScreenMonitor}
        <MonitorLabel>{this.props.label} {status}</MonitorLabel>
        <TouchableOpacity onPress={this.showVideo} style={styles.monitorPreviewContainer}>
          <ImageView style={styles.preview} blob={this.state.blob} />
          {logo}
          <View style={styles.monitorPreviewOverlay}>
            {objects}
          </View>
        </TouchableOpacity>
        <View>
          <Text>Recent Events:</Text>
          {this._renderEvents()}
        </View>
      </View>
    );
  },

  _renderEvents() {
    // TODO: We should get events streamed over the socket so that we
    // can update this list in real time.
    let events = this.state.events;
    if (!events) {
      return <Text>Loading...</Text>;
    }
    if (!events.length) {
      return <Text>No recent events registered.</Text>;
    }
    return events.map((event) => (
      <TouchableOpacity
        onPress={() => this.showVideo(event.startUTC - 2000)}
        style={styles.eventRow}>
        <Text>{this._labelForEvent(event)}</Text>
      </TouchableOpacity>
    ));
  },

  _labelForEvent(event) {
    let startTimeString = moment(event.startUTC).format('h:mm:ss a');
    let duration = (event.endUTC - event.startUTC) / 1000;
    let durationString;
    if (duration < 60) {
      durationString = `${Math.round(duration)} s`;
    } else if (duration < 3600) {
      durationString = `${Math.round(duration / 60)} min`;
    } else {
      let mins = Math.round(duration / 60);
      durationString = `${Math.floor(mins / 60)} h ${mins % 60} min`;
    }
    return `${event.data.tag} at ${startTimeString}, duration ${durationString}`;
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

  monitorPreviewContainer: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
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

  eventRow: {
    padding: 10,
  },
});
