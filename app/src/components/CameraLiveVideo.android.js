import DashSegmentPlayer from './DashSegmentPlayer';
import React from 'react';
import {
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  View,
} from 'react-native';

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
    this.refs.video.enqueue(message.frame);
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
