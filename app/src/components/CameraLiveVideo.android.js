import React from 'react-native';
import DashSegmentPlayer from './DashSegmentPlayer';

const {
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  View,
} = React;

export default class CameraLiveVideo extends React.Component {

  static propTypes = {
    deviceId: React.PropTypes.string.isRequired,
  };

  mounted = false;

  componentDidMount() {
    this.mounted = true;

    const { socket, deviceId } = this.props;
    const stream = `video-${deviceId}`;
    socket.on(stream, this._receiveSegment);
    socket.join(stream);
  }

  componentWillUnmount() {
    this.mounted = false;

    const { socket, deviceId } = this.props;
    const stream = `video-${deviceId}`;
    socket.off(stream, this._receiveSegment);
    socket.leave(stream);
  }

  _receiveSegment = (message, ack) => {
    if (!this.mounted) {
      return;
    }
    if (typeof ack === 'function') {
      ack();
    }
    // discard non video frames.
    if (message.contents !== 'mp4') {
      return;
    }
    let segment = {
      type: 'blob',
      blob: message.frame,
      startUTC: message.when,
      endUTC: message.when + (message.durationMs || 0),
    };
    this.refs.video.enqueue(segment);
  };

  render() {
    return (
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={() => this.props.navigator.pop()}>
          <Text>Back</Text>
        </TouchableWithoutFeedback>
        <DashSegmentPlayer
          style={styles.video}
          ref="video"
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  video: {
    flex: 1,
  },
});
