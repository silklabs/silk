import React from 'react-native';
import moment from 'moment';

import AsyncComponent from './AsyncComponent';

const {
  Image,
  PixelRatio,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

const VIDEO_REWIND_MS = 2000;

export default class Activity extends AsyncComponent {

  static propTypes = {
    api: React.PropTypes.object.isRequired,
    hasNetwork: React.PropTypes.bool.isRequired,

    actor: React.PropTypes.string,
    event: React.PropTypes.object,
    previewSize: React.PropTypes.object,
    startFullscreenVideo: React.PropTypes.func,
  };

  state = {
    actionBoxWidth: null,
    previewImageURL: null,
  };

  mounted = false;

  componentWillMount() {
    this.mounted = true;
    this._loadPreviewImage(this.props);
  }

  componentWillReceiveProps(nextProps) {
    this._loadPreviewImage(nextProps);
  }

  componentWillUnmount() {
    this.mounted = false;
  }

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

  async _loadPreviewImage(props) {
    let { hasNetwork, event, api } = props;
    if (!hasNetwork || this.state.previewImageURL) {
      return;
    }
    let result = null;
    try {
      result = await api.metadata.findOneAfterTime({
        metaType: 'preview',
        deviceId: event.deviceId,
        time: event.startUTC,
      });
    } catch(ex) { // eslint-disable-line no-empty
      // Couldn't load, probably due to network error.
    }
    if (!this.mounted || !result || !result.url) {
      return;
    }
    this.setStateAsync({
      previewImageURL: result.url,
    });
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
    return moment(this.props.event.startUTC).calendar(null, {
      sameElse: 'llll',
    });
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
    let actionBoxStyle = {
      width: this.state.actionBoxWidth,
      height: previewSize.height * this.state.actionBoxWidth / previewSize.width,
    };
    let previewImage = null;
    let { previewImageURL } = this.state;
    if (previewImageURL) {
      previewImage = (
        <Image
          source={{uri: previewImageURL}}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            ...actionBoxStyle,
          }}
        />
      );
    }
    return (
      <TouchableOpacity
        key={event.id || event._id}
        onPress={this._performAction}
        style={styles.eventRow}>
        <View style={[styles.actionBox, actionBoxStyle]}>
          {previewImage}
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
    shadowColor: 'black',
    shadowRadius: 2,
    shadowOpacity: 0.5,
    shadowOffset: {
      height: 1,
      width: 0,
    },
    flex: 1,
    marginVertical: 8,
    backgroundColor: '#c8c7cc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionPlayButton: {
    width: 44,
    height: 50,
    backgroundColor: 'transparent',
  },
});
