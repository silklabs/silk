/**
 * @flow
 */

import invariant from 'assert';
import React from 'react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import {
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Colors } from './CommonStyles';

export default class Button extends React.Component {

  static propTypes = {
    label: React.PropTypes.string.isRequired,
    type: React.PropTypes.oneOf(['primary', 'secondary']).isRequired,
    disabled: React.PropTypes.bool,
    onPress: React.PropTypes.func,
    style: View.propTypes.style,
    labelStyle: Text.propTypes.style,
  };

  shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate;

  render() {
    const { label, type, disabled, onPress, style, labelStyle } = this.props;
    const styles = stylesByType[type];
    invariant(styles, `Invalid button type: '${type}'`);

    const content = (
      <View style={[styles.button, disabled ? styles.disabled : null, style]}>
        <Text style={[styles.label, labelStyle]}>
          {label}
        </Text>
      </View>
    );

    if (disabled) {
      return content;
    }

    return (
      <TouchableWithoutFeedback onPress={onPress}>
        {content}
      </TouchableWithoutFeedback>
    );
  }
}

const commonStyles = {
  button: {
    borderWidth: 1,
    borderColor: 'white',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    height: 32,
    width: 120,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: 'DIN Round Pro',
    fontSize: 14,
  },
};

const stylesByType = {
  primary: StyleSheet.create({
    button: {
      ...commonStyles.button,
      backgroundColor: 'white',
    },
    disabled: {
      ...commonStyles.disabled,
    },
    label: {
      ...commonStyles.label,
      color: Colors.SilkLabsBlack,
    },
  }),
  secondary: StyleSheet.create({
    button: {
      ...commonStyles.button,
    },
    disabled: {
      ...commonStyles.disabled,
    },
    label: {
      ...commonStyles.label,
      backgroundColor: 'transparent',
      color: 'white',
    },
  }),
};
