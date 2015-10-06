/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';
import moment from 'moment';

import PreviewQueue from '../libraries/PreviewQueue';

import ImageView from './ImageView';
import MonitorFullscreen from './MonitorFullscreen';
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
    id: React.PropTypes.string.isRequired,
    label: React.PropTypes.string.isRequired,
    status: React.PropTypes.string.isRequired,
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
      previewWidth: null,
    };
  },

  showVideo(videoStartTime) {
    this.setState({ showVideo: true, videoStartTime });
  },

  onVideoHidden() {
    this.setState({ showVideo: false, videoStartTime: null });
  },

  onPreviewFrame(message) {
    this._queue.push(message);
  },

  componentWillMount() {
    let { socket, id } = this.props;

    this._queue = new PreviewQueue(this.props.label, message => {
      this.setState({
        blob: message.frame,
        objects: message.objects || [],
      });
    });

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
    if (this._queue) {
      this._queue.deinit();
      this._queue = null;
    }
  },

  render() {
    let id = this.props.id;
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
        {this._renderPreview()}
        <View>
          <Text>Recent Events:</Text>
          {this._renderEvents()}
        </View>
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
          id={this.props.id}
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
        onPress={this.showVideo}
        style={[styles.monitorPreviewContainer, previewStyle]}>
        <ImageView style={styles.preview} blob={this.state.blob} />
        {logo}
        <View style={styles.monitorPreviewOverlay}>
          {objects}
        </View>
      </TouchableOpacity>
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

  eventRow: {
    padding: 10,
  },
});
