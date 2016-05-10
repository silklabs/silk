import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export class Wordmark extends React.Component {
  render() {
    return (
      <View style={styles.wordmark}>
        <Text style={styles.silkText}>SILK</Text>
        <Text style={styles.labsText}>LABS</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
  },
  silkText: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },
  labsText: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    color: 'white',
  },
});
