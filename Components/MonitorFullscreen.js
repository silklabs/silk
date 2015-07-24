/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native'
import ReactART from 'ReactNativeART';
import LiveVideo from './LiveVideo'
import OverlayModal from './OverlayModal'
import Rectangle from './Rectangle';
import { getLandscapeDimensions } from '../Libraries/DeviceConfig';
import TimerMixin from 'react-timer-mixin';

let {
  Image,
  StatusBarIOS,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} = React;

let {
  Surface,
  Group
} = ReactART;

/**
Safeguard if faces does not get a new value within this time reset to no faces.
*/
let FACE_DISAPPEAR = 50;

let Faces = React.createClass({

  faceGroup(idx, face, ratio) {
    let x = Math.ceil(face.x * ratio);
    let y = Math.ceil(face.y * ratio);
    let width = Math.ceil(face.width * ratio);
    let height = Math.ceil(face.height * ratio);
    return (
      <Group x={x} y={y} key={idx}>
        <Rectangle
          stroke="#ADD8E6"
          height={height}
          width={width} />
      </Group>
    )
  },

  render() {
    let firstFace = this.props.faces[0];
    let { width: deviceWidth, height: deviceHeight } = getLandscapeDimensions();

    // We need to scale the dimensions correctly to the scale of the device.
    let xRatio = deviceWidth / firstFace.fieldWidth;
    let yRatio = deviceHeight / firstFace.fieldHeight;

    let ratio = Math.min(xRatio, yRatio);
    let faces = this.props.faces.map((face, idx) => {
      return this.faceGroup(idx, face, ratio);
    });

    return (
      <Surface
        width={deviceWidth}
        height={deviceHeight}>
        {faces}
      </Surface>
    );
  }
});

export default React.createClass({
  mixins: [TimerMixin],

  getInitialState() {
    return {
      faces: []
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

  render: function() {
    var videoStream = this.props.vid;
    let { width, height } = getLandscapeDimensions();

    let faces;
    if (this.state.faces.length) {
      faces = <Faces faces={this.state.faces} />
    } else {
      faces = <View />
    }

    return (
      <OverlayModal ref="overlay"
                    onShowStart={this.onShowStart}
                    onDismissEnd={this.onDismissEnd}
                    presented={this.props.presented}>

        <TouchableWithoutFeedback onPress={this.close}>
          <View style={[styles.container]}>
            <LiveVideo style={styles.video} onFaces={this.onFaces} videoStream={videoStream} ref='video'>
            </LiveVideo>
            <View style={styles.videoOverlay}>
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

  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black'
  }
});
