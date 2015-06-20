/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  AppRegistry,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} = React;

var MonitorPreview = require('./MonitorPreview');

var Silk = React.createClass({
  render: function() {
    return (
      <View style={styles.container}>
        <View style={styles.titleContainer}>
          <View style={styles.spacer} />
          <Text style={styles.title}>Silk</Text>
          <View style={styles.spacer}>
            <View style={styles.settings}>
              <Image source={require('image!Settings')} style={styles.icon} />
            </View>
          </View>
        </View>
        <View style={styles.content}>
          <ScrollView style={styles.monitors}>
            <MonitorPreview label='Living Room' />
            <MonitorPreview label="Kids' Room" />
            <MonitorPreview label='Garage' />
          </ScrollView>  
        </View>
      </View>
    );
  }
});
        
var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleContainer: {
    backgroundColor: 'white',
    textAlign: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingTop: 30,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 5,
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
    color: '#656569',
  },
  settings: {
    alignItems: 'flex-end',
    flex: 1,
    padding: 4,
  },
  icon: {
    // TODO: shouldn't have to specify this?
    width: 20,
    height: 20,
  },
  spacer: {
    flex: 1,
  },
  content: {
    borderColor: '#c8c7cc',
    borderTopWidth: 1,
    backgroundColor: 'white',
    flex: 1,
  },

  monitors: {
    paddingTop: 5,
    backgroundColor: '#e5eaec',
    flex: 1,
  },
});

AppRegistry.registerComponent('Silk', () => Silk);
