import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from './CommonStyles';

export class Wordmark extends React.Component {
  render() {
    return (
      <View style={styles.wordmark}>
        <Text style={styles.label}>SILK</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
  },
  label: {
    fontFamily: 'DIN Round Pro',
    fontSize: 24,
    color: Colors.SilkLabsYellow,
    backgrondColor: 'transparent',
  },
});
