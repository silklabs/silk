import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export class CameraMarkText extends React.Component {
  render() {
    return (
      <View style={styles.camMarkContainer}>
        <Text style={styles.silkText}>SILK</Text>
        <Text style={styles.camText}>CAM</Text>
      </View>
    );
  }
}

export class DefaultText extends React.Component {
  render() {
    return (
        <Text style={styles.default}>{this.props.children}</Text>
    );
  }
}

export class LabelText extends React.Component {
  render() {
    return (
        <Text style={styles.label}>{this.props.children}</Text>
    );
  }
}

export class PlaceholderText extends React.Component {
  render() {
    return (
        <Text style={styles.placeholder}>{this.props.children}</Text>
    );
  }
}

export class WordMarkText extends React.Component {
  render() {
    return (
        <View style={styles.markContainer}>
          <Text style={styles.silkText}>SILK</Text>
          <Text style={styles.labsText}>LABS</Text>
        </View>
    );
  }
}

const styles = StyleSheet.create({

  camMarkContainer: {
    flexDirection: 'row',
  },
  camText: {
    fontFamily: 'Open Sans',
    fontSize: 18,
    color: 'white',
  },


  default: {
    fontFamily: 'Open Sans',
    color: '#656569',
  },

  label: {
    fontFamily: 'Open Sans',
    color: '#656569',
    fontSize: 15,
    textAlign: 'left',
  },

  placeholder: {
    fontFamily: 'Open Sans',
    fontSize: 15,
    fontStyle: 'italic',
    color: '#bbbbbb',
  },

  markContainer: {
    flexDirection: 'row',
    margin: 10,
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
