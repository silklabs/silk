import React from 'react-native';
let { LiveVideoManager} = React;

let LiveVideoNative = React.requireNativeComponent('LiveVideo');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'livevideo';

const SegmentProps = [
  'type',
  'data',
  'url',
  'startUTC',
  'endUTC',
  'id',
  'nextId',
  'previousId',
  'objects'
];

class Segment {
  constructor(options = {}) {
    // TODO: type checks.
    for (var prop of SegmentProps) {
      this[prop] = options[prop];
    }

    /**
     * We provide custom functions for managing state here since we _must_ not
     * mutate any properties after this object is setup to make react happy.
     */
    this._onStart = [];
  }

  addStartCallback(fn) {
    this._onStart.push(fn)
  }

  fireStartCallbacks() {
    this._onStart.map(fn => fn());
  }

  /**
   * Only transmit specific properties used by the segment.
   */
  toJSON() {
    let result = {};
    for (var prop of SegmentProps) {
      result[prop] = this[prop];
    }
    return result;
  }
}


let LiveVideo = React.createClass({
  propTypes: {
    rate: React.PropTypes.number,
    /**
    Invoked every N milliseconds with current time in playback.
    Time is a UTC value not relative time in playback.
    */
    onTimeChange: React.PropTypes.func,

    /**
    Invoked on segment errors.
    */
    onSegmentError: React.PropTypes.func,

    /**
    Invoked when the segment starts.
    */
    onSegmentStart: React.PropTypes.func,

    /**
    Invoked when the segment has reached its end time.
    */
    onSegmentEnd: React.PropTypes.func,

    /**
    Array of segments used to control playback and buffering.
    */
    segments: React.PropTypes.array
  },

  getNativeHandle() {
    return React.findNodeHandle(this.refs[RCT_NATIVE_REF]);
  },

  render() {
    let nativeProps = Object.assign({}, this.props, {
      ref: RCT_NATIVE_REF
    });

    return (
      <LiveVideoNative {... nativeProps} />
    );
  }
});

LiveVideo.Segment = Segment;
export default LiveVideo;
