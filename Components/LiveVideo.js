import React from 'react-native';
import { LiveVideoManager} from 'NativeModules';
import EventEmitter from 'EventEmitter';

var LiveVideoNative = React.requireNativeComponent('LiveVideo');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'livevideo';

const SegmentProps = [
  'type',
  'data',
  'url',
  'startUTC',
  'endUTC',
  'faces',
  'id',
  'nextId',
  'previousId'
];

class Segment extends EventEmitter {
  constructor(options = {}) {
    super()

    // TODO: type checks.
    for (var prop of SegmentProps) {
      this[prop] = options[prop];
    }
  }

  sendStart() {
    this.emit('start');
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
    Invoked when face(s) appear in the video.
    */
    onFaces: React.PropTypes.func,

    /**
    Invoked every N milliseconds with current time in playback.
    Time is a UTC value not relative time in playback.
    */
    onTimeChange: React.PropTypes.func,

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
