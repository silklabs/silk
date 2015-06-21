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

var SocketIO = require('react-native-swift-socketio');

// TODO import weave-api
var SERVER_URL = 'localhost:5000';

var MonitorPreview = require('./MonitorPreview');

var Silk = React.createClass({
  getInitialState: function() {
    return {};
  },

  componentDidMount: function() {
    this.socket = new SocketIO(SERVER_URL);
    this.socket.connect();
    console.log('Connecting to ...', SERVER_URL);
    this.socket.on('connect', () => {
      console.log(' ... connected');
      this.socket.on('video-stream-new', msga => {
        var msg = msga[0];
        var state = this.state;
        state[msg.id] = { name: msg.name };
        this.setState(state);
      });
      this.socket.on('video-stream-delete', msga => {
        var msg = msga[0];
        var state = this.state;
        delete state[msg.id];
        this.setState(state);
      });
      this.socket.emit('join', 'video-streams');
    });
  },

  componentWillUnmount: function() {
    this.socket.close();
  },
  
  render: function() {
    var previewStreams = Object.keys(this.state).map(key => {
      var device = this.state[key];
      return (<MonitorPreview key={key} vid={key} label={device.name}
                              serverUrl={SERVER_URL} />);
    });
    if (0 === previewStreams.length) {
      previewStreams = (<PlaceholderMessage />);
    }
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
            {previewStreams}
          </ScrollView>  
        </View>
      </View>
    );
  }
});

var PlaceholderMessage = React.createClass({
  render: function() {
    return (
      <Text style={styles.placeholderText}>
        Connect SilkCam to get started
      </Text>
    );
  },
});

var styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleContainer: {
    backgroundColor: 'white',
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

  placeholderText: {
    color: '#bbbbbb',
    fontSize: 15,
    fontStyle: 'italic',
    padding: 5,
  },
  monitors: {
    paddingTop: 5,
    backgroundColor: '#e5eaec',
    flex: 1,
  },
});

AppRegistry.registerComponent('Silk', () => Silk);
