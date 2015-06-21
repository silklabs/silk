/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var React = require('react-native');
var {
  StyleSheet,
  Text,
  View,
} = React;
var ProgressBar = require('./ProgressBar');

/**
 * Return |{ heat, value }| where heat represents { cold, warm, hot }
 * and value is proportional to the logarithm of the user's closeness,
 * where 0 ~ very far, and 1 ~ very close.
 */
// TODO: tween color values?
function rssiToHeat(rssi) {
  var value = (rssi + 100.0) / 65.0;
  if (rssi < -70) {
    return { heat: '#3c4884', value: value };
  }
  if (rssi < -50) {
    return { heat: '#e6a45a', value: value };
  }
  return { heat: '#8c2212', value: value };
}

var DeviceSetup = React.createClass({
  render: function() {
    var heat = rssiToHeat(this.props.rssi);
    return (
      <View style={styles.container}>
        <View style={styles.labelContainer}>
          <Text style={styles.label}>
            Move phone close to new device ...</Text>
        </View>
        <View style={styles.progressContainer}>
          <ProgressBar completePercentage={100.0 * heat.value}
                       color={heat.heat}
                       backgroundColor='#b7b6b5'
                       style={styles.progress} />
        </View>
      </View>
    );
  },
});

var styles = StyleSheet.create({
  container: {
    shadowColor: 'black',
    shadowRadius: 2,
    shadowOpacity: 0.5,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    // TODO better color
    backgroundColor: 'white',
    paddingTop: 5,
    marginTop: 5,
    marginBottom: 5,
    marginLeft: 8,
    marginRight: 7,
    flex: 1,
  },
  labelContainer: {
    paddingLeft: 10,
    paddingBottom: 10,
  },
  label: {
    color: '#656569',
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'left',
  },
  progressContainer: {
    paddingLeft: 5,
    paddingRight: 5,
    paddingBottom: 1,
  }
});

module.exports = DeviceSetup;
