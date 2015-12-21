import React from 'react-native';
let {
  Image,
  Navigator,
  StyleSheet,
  TouchableOpacity,
  View,
} = React;
import { CameraMarkText } from './Text';

const CONNECTION_STATES = ['connecting', 'connected', 'offline'];

export default class TopBar extends React.Component {

  static propTypes = {
    socketConnectionState: React.PropTypes.oneOf(CONNECTION_STATES).isRequired,
  };

  render() {
    let connectionStyle = styles[this.props.socketConnectionState];
    return (
      <View>
        <View style={styles.statusBarUnderlay} />
        <View style={styles.titleContainer}>
          <View style={styles.spacer}>
            <TouchableOpacity onPress={this._openSettings}>
              <View style={styles.settings}>
                <Image
                  source={require('image!Menu')}
                  style={styles.icon}
                />
              </View>
            </TouchableOpacity>
          </View>
          <CameraMarkText />
          <View style={styles.spacer}>
            <View style={styles.indicatorContainer}>
              <View style={[styles.connectionStateMarker, connectionStyle]} />
            </View>
          </View>
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
  statusBarUnderlay: {
    height: Navigator.NavigationBar.Styles.General.StatusBarHeight,
    backgroundColor: '#404e55',
  },
  titleContainer: {
    backgroundColor: '#2b3a42',
    justifyContent: 'center',
    flexDirection: 'row',
    padding: 10,
  },
  indicatorContainer: {
    // For some reason cjones was unable to make this `flex` fill
    // available vertical space inside the title container (when
    // changing the flex direction back to col).  So hack around that
    // by hard-coding a fixed height.
    //
    //flex: 1,
    height: 25,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  connectionStateMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#c8c7cc',
  },

  offline: {
    backgroundColor: '#ce0000',
  },
  connecting: {
    backgroundColor: '#f7d708',
  },
  connected: {
    backgroundColor: '#9ccf31',
  },

  settings: {
    flex: 1,
    paddingLeft: 4,
  },
  icon: {
    // TODO: shouldn't have to specify this?
    width: 24,
    height: 24,
  },
  spacer: {
    flex: 1,
  },
});
