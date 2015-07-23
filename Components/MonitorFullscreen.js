/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

import React from 'react-native'
import LiveVideo from './LiveVideo'
import OverlayModal from './OverlayModal'

let {
  Image,
  StatusBarIOS,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} = React;

export default React.createClass({
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

  render: function() {
    var videoStream = this.props.vid;

    return (
      <View style={styles.container}>
        <OverlayModal ref="overlay"
                      onShowStart={this.onShowStart}
                      onDismissEnd={this.onDismissEnd}
                      style={styles.container}
                      presented={this.props.presented}>

          <TouchableWithoutFeedback onPress={this.close}>
            <LiveVideo videoStream={videoStream} ref='video' />
          </TouchableWithoutFeedback>

        </OverlayModal>
      </View>
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
  container: {
    flex: 1,
    alignItems: 'stretch',
    backgroundColor: 'black'
  },
});
