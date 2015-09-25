/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react-native';

let {
  Text,
  TouchableOpacity,
  StyleSheet,
} = React;


export default class TextLink extends React.Component {
  static propTypes = {
    label: React.PropTypes.string,
    onClick: React.PropTypes.func,
  };

  onPress = () => {
    if (this.props.onClick) {
      this.props.onClick();
    }
  }

  render() {
    return (
      <TouchableOpacity onPress={this.onPress}>
        <Text style={styles.label}>{this.props.label}</Text>
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'Open Sans',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#99a0a4',
  },
});
