import React from 'react-native';
import { LiveVideoManager} from 'NativeModules';

var LiveVideoNative = React.requireNativeComponent('LiveVideo');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'livevideo';

const Segment = {
  fromURL(object) {
    // TODO: typechecks.
    return Object.assign({}, object, {
      type: 'url'
    });
  },

  fromFrame(object) {
    // TODO: typechecks.
    return Object.assign({}, object, {
      type: 'data'
    });
  },
};

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
