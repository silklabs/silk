/**
 * @flow
 */

import React from 'react';
import {
  Image,
  Navigator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from './CommonStyles';

export default class TopBar extends React.Component {

  render() {
    return (
      <View style={styles.navBar}>
        <Image
          source={require('../assets/menu_pattern.png')}
          style={styles.pattern}
        />
        <View style={styles.titleContainer}>
          <View style={styles.spacer}>
            <TouchableOpacity onPress={this._openSettings}>
              <View style={styles.settings}>
                <Image
                  source={require('../assets/gear.png')}
                  style={styles.gear}
                />
              </View>
            </TouchableOpacity>
          </View>
          <Text style={styles.wordmark}>SILK</Text>
          <View style={styles.spacer} />
        </View>
      </View>
    );
  }

  _openSettings = () => {
    this.props.navigator.push({
      name: 'Settings',
    });
  };

}

const styles = StyleSheet.create({
  navBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Navigator.NavigationBar.Styles.General.TotalNavHeight,
    backgroundColor: Colors.SilkLabsRed,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.2,
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: Navigator.NavigationBar.Styles.General.StatusBarHeight,
    height: Navigator.NavigationBar.Styles.General.NavBarHeight,
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 10,
  },

  wordmark: {
    fontFamily: 'DIN Round Pro',
    fontSize: 18,
    color: Colors.SilkLabsYellow,
    backgroundColor: 'transparent',
  },

  indicatorContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  connectionStateMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
  },

  offline: {
    backgroundColor: Colors.WarningRed,
  },
  connecting: {
    backgroundColor: Colors.SilkLabsYellow,
  },
  connected: {
    backgroundColor: Colors.ConfirmGreen,
  },

  settings: {
    flex: 1,
    paddingLeft: 4,
  },
  gear: {
    width: 32,
    height: 32,
  },
  spacer: {
    flex: 1,
  },
});
