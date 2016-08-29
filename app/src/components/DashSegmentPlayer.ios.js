/**
 * @flow
 */

import React from 'react';
import {
  NativeModules,
  findNodeHandle,
  requireNativeComponent,
} from 'react-native';

const DashSegmentPlayerNative = requireNativeComponent('DashSegmentPlayer');
const { DashSegmentPlayerManager } = NativeModules;

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'player';

/**
 * Native video player that can be fed mp4 DASH segments.
 *
 * Mimics some of the events and properties of HTMLVideoElement.
 */
export default class DashSegmentPlayer extends React.Component {

  static propTypes = {
    onCanPlay: React.PropTypes.func,
    onPlay: React.PropTypes.func,
    onPause: React.PropTypes.func,
    onWaiting: React.PropTypes.func,
    onPlaying: React.PropTypes.func,
    onTimeUpdate: React.PropTypes.func,
    onError: React.PropTypes.func,
  };

  _buffered: number = 0;
  get buffered(): number {
    return this._buffered;
  }

  _currentTime: number = 0;
  get currentTime(): number {
    return this._currentTime;
  }

  // We currently do not support setting this value.
  get playbackRate(): number {
    return 1.0;
  }

  _paused: boolean = false;
  get paused(): boolean {
    return this._paused;
  }

  // We currently do not support setting this value.
  get muted(): boolean {
    return false;
  }

  getNativeHandle() {
    return findNodeHandle(this.refs[RCT_NATIVE_REF]);
  }

  play() {
    DashSegmentPlayerManager.play(this.getNativeHandle());
  }

  pause() {
    DashSegmentPlayerManager.pause(this.getNativeHandle());
  }

  enqueue(blob: Blob): Promise<void> {
    return DashSegmentPlayerManager.enqueue(this.getNativeHandle(), blob);
  }

  _onPlay = () => {
    this._paused = false;
    this.props.onPlay && this.props.onPlay();
  };

  _onPause = () => {
    this._paused = true;
    this.props.onPause && this.props.onPause();
  };

  _onTimeUpdate = (event) => {
    const {nativeEvent} = event;
    this._buffered = nativeEvent.buffered;
    this._currentTime = nativeEvent.currentTime;
    this.props.onTimeUpdate && this.props.onTimeUpdate(nativeEvent);
  };

  render() {
    return (
      <DashSegmentPlayerNative
        ref={RCT_NATIVE_REF}
        {...this.props}
        onPlay={this._onPlay}
        onPause={this._onPause}
        onTimeUpdate={this._onTimeUpdate}
      />
    );
  }

}
