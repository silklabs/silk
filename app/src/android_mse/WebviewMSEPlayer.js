/**
 * Render the web-based MSE player in a native app via a webview.
 *
 * The component is controlled and fed with data via an EventEmitter
 * that somehow needs to be hooked up to the native wrapper of the
 * webview, which is something the consumer of this component needs to
 * set up.
 *
 * @flow
 */

import EventEmitter from 'events';
import React from 'react';
import { MSEPlayer } from 'silk-mse-player';

export default class WebviewMSEPlayer extends React.Component {

  static propTypes = {
    eventEmitter: React.PropTypes.instanceOf(EventEmitter),
  };

  componentDidMount() {
    const emitter = this.props.eventEmitter;
    emitter.on('segment', (seg) => this.refs.msePlayer.feedSegmentData(seg));
    emitter.on('play', () => this.refs.msePlayer.videoElement.play());
    emitter.on('pause', () => this.refs.msePlayer.videoElement.pause());
  }

  render() {
    return (
      <div style={styles.global}>
        <MSEPlayer
          ref="msePlayer"
          autoPlay="true"
          style={styles.video}
        />
      </div>
    );
  }
}

const styles = {
  global: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: 'green',
  },
  video: {
    display: 'block',
    width: '100%',
    pointerEvents: 'none',
    borderWidth: 2,
    borderColor: 'pink',
  },
};
