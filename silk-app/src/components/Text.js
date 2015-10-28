/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let React = require('react-native');
let {
  StyleSheet,
  Text,
  View,
} = React;

class CameraMarkText extends React.Component {
  render() {
    return (
      <View style={styles.camMarkContainer}>
        <Text style={styles.silkText}>SILK</Text>
        <Text style={styles.camText}>CAM</Text>
      </View>
    );
  }
}

class DefaultText extends React.Component {
  render() {
    return (
        <Text style={styles.default}>{this.props.children}</Text>
    );
  }
}

class LabelText extends React.Component {
  render() {
    return (
        <Text style={styles.label}>{this.props.children}</Text>
    );
  }
}

class PlaceholderText extends React.Component {
  render() {
    return (
        <Text style={styles.placeholder}>{this.props.children}</Text>
    );
  }
}

class WordMarkText extends React.Component {
  render() {
    return (
        <View style={styles.markContainer}>
          <Text style={styles.silkText}>SILK</Text>
          <Text style={styles.labsText}>LABS</Text>
        </View>
    );
  }
}

let styles = StyleSheet.create({

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

module.exports = {
  CameraMarkText: CameraMarkText,
  Text: DefaultText,
  LabelText: LabelText,
  PlaceholderText: PlaceholderText,
  WordMarkText: WordMarkText,
};
