import React from 'react-native';
var {
  Image,
  PixelRatio,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

import moment from 'moment';

const VIDEO_REWIND_MS = 2000;

export default class Activity extends React.Component {

  static propTypes = {
    actor: React.PropTypes.string,
    event: React.PropTypes.object,
    previewSize: React.PropTypes.object,
    startFullscreenVideo: React.PropTypes.func,
  };

  state = {
    actionBoxWidth: null,
  };

  render() {
    return (
      <View style={styles.activityRow}>
        <View style={styles.iconPlaceholder} />
        <View style={styles.activityColumn}>
          <Text style={styles.actorLabel}>{this.props.actor}</Text>
          <Text style={styles.activityLabel}>{this._getActivityLabel()}</Text>
          {this._renderAction()}
          <Text style={styles.timeLabel}>{this._getTimeLabel()}</Text>
        </View>
      </View>
    );
  }

  _getActivityLabel() {
    let { event } = this.props;
    let duration = (event.endUTC - event.startUTC) / 1000;
    let durationString;
    if (duration < 60) {
      durationString = `${Math.round(duration)} s`;
    } else if (duration < 3600) {
      durationString = `${Math.round(duration / 60)} min`;
    } else {
      let mins = Math.round(duration / 60);
      durationString = `${Math.floor(mins / 60)} h ${mins % 60} min`;
    }
    return `Registered ${event.data.tag} for ${durationString}`;
  }

  _getTimeLabel() {
    return moment(this.props.event.startUTC).format('h:mm:ss a');
  }

  _performAction = () => {
    let { event } = this.props;
    this.props.startFullscreenVideo(
      event.deviceId,
      event.startUTC - VIDEO_REWIND_MS
    );
  };

  _renderAction() {
    let { actionBoxWidth } = this.state;
    if (actionBoxWidth === null) {
      return (
        <View
          onLayout={(event) => this.setState({actionBoxWidth: event.nativeEvent.layout.width})}
          style={styles.actionBox}
        />
      );
    }

    let { event, previewSize } = this.props;
    if (!previewSize) {
      // Guestimate based on FUT hardware.
      previewSize = { width: 16, height: 9 };
    }
    let actionBoxStyle = {
      width: this.state.actionBoxWidth,
      height: previewSize.height * this.state.actionBoxWidth / previewSize.width,
    };
    return (
      <TouchableOpacity
        key={event.id || event._id}
        onPress={this._performAction}
        style={styles.eventRow}>
        <View style={[styles.actionBox, actionBoxStyle]}>
          <Image
            source={require('image!PlayButton')}
            style={styles.actionPlayButton}
          />
        </View>
      </TouchableOpacity>
    );
  }

}

const styles = StyleSheet.create({
  activityRow: {
    flexDirection: 'row',
    borderBottomWidth: 1 / PixelRatio.get(),
    borderColor: '#c8c7cc',
    paddingVertical: 16,
    paddingRight: 16,
  },
  iconPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#c8c7cc',
    marginHorizontal: 16,
  },
  activityColumn: {
    flex: 1,
  },
  actorLabel: {
    fontSize: 17,
  },
  activityLabel: {
    marginTop: 4,
    color: 'gray',
  },
  timeLabel: {
    fontSize: 12,
    color: '#c8c7cc',
  },
  actionBox: {
    flex: 1,
    marginVertical: 8,
    backgroundColor: '#c8c7cc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionPlayButton: {
    width: 44,
    height: 50,
  },
});
