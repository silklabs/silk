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

var MonitorsView = require('./MonitorsView');
var WifiSettings = require('./WifiSettings');

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
                        ssidHint={route.ssidHint} pskHint={route.pskHint}
                        resolve={route.resolve} reject={route.reject} />
      );
    };
    return (<Text>Unknown scene {route.name}</Text>);
  },   

  onForward: function() {
    // --> Settings
  },
  
  configureScene: function(route) {
    return Navigator.SceneConfigs.FloatFromBottom;
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
});

AppRegistry.registerComponent('Silk', () => Silk);
