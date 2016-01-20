import React from 'react-native';

const DashSegmentPlayerNative = React.requireNativeComponent('DashSegmentPlayer');
const { DashSegmentPlayerManager } = React.NativeModules;

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'player';

export default class DashSegmentPlayer extends React.Component {

  static propTypes = {
    /**
     * Invoked every N milliseconds with current time in playback.
     * Time is a UTC value not relative time in playback.
     */
    onTimeChange: React.PropTypes.func,

    /**
     * Invoked on segment errors.
     */
    onSegmentError: React.PropTypes.func,

    /**
     * Invoked when the segment has loaded and been enqueued for
     * playback.
     */
    onSegmentEnqueued: React.PropTypes.func,

    /**
     * Invoked when the segment starts.
     */
    onSegmentStart: React.PropTypes.func,

    /**
     * Invoked when the segment has reached its end time.
     */
    onSegmentEnd: React.PropTypes.func,
  };

  getNativeHandle() {
    return React.findNodeHandle(this.refs[RCT_NATIVE_REF]);
  }

  play() {
    DashSegmentPlayerManager.play(this.getNativeHandle());
  }

  pause() {
  }

  enqueue(segment) {
    DashSegmentPlayerManager.enqueue(this.getNativeHandle(), segment);
  }

  render() {
    return (
      <DashSegmentPlayerNative ref={RCT_NATIVE_REF} {...this.props} />
    );
  }

}
