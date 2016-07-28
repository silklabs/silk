/**
 * @flow
 */

import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import AsyncComponent from '../abstract/AsyncComponent';
import { Colors, LayoutStyles } from '../CommonStyles';

export default class SetupScreen extends AsyncComponent {

  static propTypes = {
    primaryButton: React.PropTypes.element,
    secondaryButton: React.PropTypes.element,
    title: React.PropTypes.string,
    subtitle: React.PropTypes.string,
  };

  render() {
    let { primaryButton, secondaryButton } = this.props;
    if (primaryButton && secondaryButton) {
      secondaryButton = React.createElement(
        secondaryButton.type,
        {
          ...secondaryButton.props,
          style: [secondaryButton.style, styles.secondaryButton],
        }
      );
    }
    // This is a ScrollView not because we need scrolling, but we need
    // to play well with the native keyboard.
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps={false}
        alwaysBounceVertical={false}
        scrollable={false}>
        <Image
          source={require('../../assets/setup_background_pattern.png')}
          style={styles.pattern}
        />
        <View style={LayoutStyles.statusBarPlaceholder} />
        <View style={styles.content}>
          <Text style={styles.title}>
            {this.props.title}
          </Text>
          <Text style={styles.subtitle}>
            {this.props.subtitle}
          </Text>
          {this.props.children}
          <View style={styles.buttonRow}>
            {secondaryButton}
            {primaryButton}
          </View>
        </View>
      </ScrollView>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.SilkLabsGreen,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  title: {
    fontFamily: 'DIN Round Pro',
    fontSize: 24,
    color: 'white',
    backgroundColor: 'transparent',
  },
  subtitle: {
    fontFamily: 'DIN Round Pro',
    fontWeight: '600',
    fontSize: 14,
    color: Colors.SilkLabsBlack,
    backgroundColor: 'transparent',
    marginVertical: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    flex: 1,
    marginTop: 16,
  },
  secondaryButton: {
    marginRight: 16,
  },
});

