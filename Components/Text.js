/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

let React = require('react-native');
let {
  StyleSheet,
  Text,
} = React;

let DefaultText = React.createClass({
  render: function() {
    return (
        <Text style={styles.default}>{this.props.children}</Text>
    );
  }
});

let HeaderText = React.createClass({
  render: function() {
    return (
        <Text style={styles.header}>{this.props.children}</Text>
    );
  }
});

let LabelText = React.createClass({
  render: function() {
    return (
        <Text style={styles.label}>{this.props.children}</Text>
    );
  }
});

let PlaceholderText = React.createClass({
  render: function() {
    return (
        <Text style={styles.placeholder}>{this.props.children}</Text>
    );
  }
});

let styles = StyleSheet.create({
  default: {
    fontFamily: 'Open Sans',
    color: '#656569',
  },

  header: {
    fontFamily: 'Open Sans',
    fontWeight: 'bold',
    fontSize: 24,
    textAlign: 'center',
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
});

module.exports = {
  Text: DefaultText,
  HeaderText: HeaderText,
  LabelText: LabelText,
  PlaceholderText: PlaceholderText,
};
