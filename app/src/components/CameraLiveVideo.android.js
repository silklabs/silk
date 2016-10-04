/**
 * @flow
 */

import DashSegmentPlayer from './DashSegmentPlayer';
import React from 'react';
import {
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  View,
} from 'react-native';

export default class CameraLiveVideo extends React.Component {

  onMessage = (message: Object) => {
    this.refs.video.enqueue(message.frame).then(() => message.frame.close());
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
