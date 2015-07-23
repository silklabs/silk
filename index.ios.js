/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  AppRegistry,
  Navigator,
  StyleSheet,
  Text,
  View,
} = React;

var MonitorFullscreen = require('./Components/MonitorFullscreen');
var MonitorsView = require('./Components/MonitorsView');
var WifiSettings = require('./Components/WifiSettings');

var Silk = React.createClass({
  render: function() {
    return (
        <Navigator initialRoute={{name: 'Monitors', index: 0}}
                   onForward={this.onForward}
                   configureScene={this.configureScene}
                   renderScene={this.renderScene}
                   style={styles.container} />
    );
  },

  renderScene: function(route, navigator) {
    switch (route.name) {
    case 'Monitors':
      return (
        <MonitorsView navigator={navigator} name={route.name} />
      );
    case 'WifiSettings':
      return (
          <WifiSettings navigator={navigator} name={route.name}
                        hints={route.hints}
                        resolve={route.resolve} reject={route.reject} />
      );
    case 'MonitorFullscreen':
      return (
        <MonitorFullscreen navigator={navigator}
                           vid={route.vid} serverUrl={route.serverUrl} />
      );
    };
    return (
      <View style={{flex: 1, backgroundColor: 'red', paddingTop: 32}}>
        <Text style={{color: 'yellow', fontSize: 30}}>
          Unknown scene {route.name}
        </Text>
      </View>
    );
  },

  onForward: function() {
    // --> Settings
  },

  configureScene: function(route) {
    switch (route.name) {
    case 'WifiSettings':
      return Navigator.SceneConfigs.FloatFromBottom;
    default:
      return Navigator.SceneConfigs.PushFromRight;
    }
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
});

AppRegistry.registerComponent('Silk', () => Silk);
