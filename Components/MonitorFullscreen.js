/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native'
import LiveVideo from './LiveVideo'
import OverlayModal from './OverlayModal'
import Rectangle from './Rectangle';
import FaceBoxes from './FaceBoxes';
import { getLandscapeDimensions } from '../Libraries/DeviceConfig';
import TimerMixin from 'react-timer-mixin';
import moment from 'moment';

let {
  StatusBarIOS,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} = React;

/**
Safeguard if faces does not get a new value within this time reset to no faces.
*/
let FACE_DISAPPEAR = 50;

export default React.createClass({
  mixins: [TimerMixin],

  getInitialState() {
    return {
      faces: [],
      time: null
    }
  },

  getInitialProps() {
    return {
      presented: false,
      onClose: function() {}
    }
  },

  onShowStart() {
    StatusBarIOS.setHidden(true, 'slide');
  },

  onDismissEnd() {
    StatusBarIOS.setHidden(false, 'slide');
  },

  onFaces(event) {
    let facesArray = event.nativeEvent.faces.faces;
    this.clearTimeout(this.facesTimer);
    this.setState({ faces: facesArray });

    // Safe guard against never getting a message to zero out faces.
    // This happens infrequently (and may be a bug somewhere in event handling
    // or device side).
    this.facesTimer = this.setTimeout(() => {
      this.setState({ faces: [] });
    }, FACE_DISAPPEAR);
  },

  onTimeChange(event) {
    let time = event.nativeEvent.time;
    this.setState({ time: time });
  },

  render: function() {
    var videoStream = this.props.vid;
    let { width, height } = getLandscapeDimensions();

    let faces;
    if (this.state.faces.length) {
      faces = <FaceBoxes width={width} height={height} faces={this.state.faces} />
    }

    let currentTime;
    let lag;
    if (this.state.time) {
      let format = moment(new Date(this.state.time)).format(
        'h:mm:ss a'
      );

      currentTime = (
        <Text style={styles.timeOverlay}>
          {format}
        </Text>
      );

      lag = (
        <Text style={styles.lagOverlay}>
          {Date.now() - this.state.time}
        </Text>
      );
    }

    return (
      <OverlayModal ref="overlay"
                    onShowStart={this.onShowStart}
                    onDismissEnd={this.onDismissEnd}
                    presented={this.props.presented}>

        <TouchableWithoutFeedback onPress={this.close}>
          <View style={[styles.container]}>
            <LiveVideo
              onFaces={this.onFaces}
              onTimeChange={this.onTimeChange}
              style={styles.video}
              videoStream={videoStream}
              ref='video' />
            <View style={[styles.videoOverlay, { width, height }]}>
              {currentTime}
              {lag}
              {faces}
            </View>
          </View>
        </TouchableWithoutFeedback>

      </OverlayModal>
    )
  },

  close() {
    var overlay = this.refs.overlay;
    var video = this.refs.video;

    // XXX: This is a hack the video should clean itself up.
    video.destroy()
    // Signal dismissal of the view (but let it animate closed)
    overlay.dismiss().then(() => {
      // After the animation allow any parent views to cleanup..
      this.props.onClose()
    });
  },
});

var styles = StyleSheet.create({
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },

  videoOverlay: {
    backgroundColor: 'transparent',
  },

  timeOverlay: {
    fontFamily: 'AppleSDGothicNeo-SemiBold',
    color: 'white',
    opacity: 0.5,
    position: 'absolute',
    top: 10,
    left: 10,
    padding: 1,
    backgroundColor: 'black'
  },

  lagOverlay: {
    fontFamily: 'AppleSDGothicNeo-SemiBold',
    color: 'red',
    opacity: 0.3,
    position: 'absolute',
    bottom: 10,
    right: 10
  },

  container: {
    flex: 1,
    backgroundColor: 'black'
  }
});
