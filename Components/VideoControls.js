import React from 'react-native';
import SystemButton from './SystemButton';
import TimerMixin from 'react-timer-mixin';
import Config from '../Libraries/Config';

import moment from 'moment';

let {
  StyleSheet,
  Text,
  View,
  SliderIOS
} = React;

export default React.createClass({
  mixins: [TimerMixin],

  getInitialState() {
    return {
      // null when we are not seeking a number otherwise.
      seekTime: null,
    };
  },

  getDefaultProps() {
    let noop = function(){};
    return {
      playing: false,
      seekChangeThreshold: 100,
      live: false,
      onDone: noop,
      onSeekEnd: noop,
      onSeekChange: noop,
      onSeekStart: noop,
      onPlay: noop,
      onPause: noop,
      onFastForward: noop,
      onRewind: noop,
      startTime: 0,
      endTime: 0,
      currentTime: 0,
    };
  },

  propTypes: {
    style: View.propTypes.style,
    playing: React.PropTypes.bool,
    seekChangeThreshold: React.PropTypes.number,
    startTime: React.PropTypes.number.isRequired,
    currentTime: React.PropTypes.number.isRequired,
    endTime: React.PropTypes.number.isRequired,
    onDone: React.PropTypes.func,
    onSeekStart: React.PropTypes.func,
    onSeek: React.PropTypes.func,
    onSeekEnd: React.PropTypes.func,
    onPlay: React.PropTypes.func,
    onPause: React.PropTypes.func,
    onFastForward: React.PropTypes.func,
    onRewind: React.PropTypes.func,
    live: React.PropTypes.bool,
  },

  _seeking: false,
  _lastChangeEventValue: null,

  formatUTCTime(time) {
    return moment(new Date(time)).format(
      'h:mm:ss a'
    );
  },

  dayStart() {
    let date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  },

  daySeconds(time) {
    let date = new Date(time);
    let start = this.dayStart();
    // Number of elapsed seconds in the given day.
    return Math.ceil((date.valueOf() - start.valueOf()) / 1000);
  },

  onSeekStart(value) {
    // Reset last change event value each time we start.
    this._lastChangeEventValue = null;
    this.props.onSeekStart(value);
  },

  onSeekChange() {
    // Do not invoke onSeekChange unless value has actually changed.
    if (this._lastChangeEventValue === this.state.seekTime) {
      return;
    }

    this.props.onSeekChange(this.state.seekTime);
    this._lastChangeEventValue = this.state.seekTime;
  },

  onSeek(value) {
    let absoluteValue = this.dayStart().valueOf() + (value * 1000);
    this.setState({ seekTime: absoluteValue });

    this.clearTimeout(this._seekChangeTimeout);
    this._seekChangeTimeout = this.setTimeout(
      this.onSeekChange,
      this.props.seekChangeThreshold
    );

    if (!this._seeking) {
      this._seeking = true;
      this.onSeekStart(absoluteValue);
    }
  },

  onSeekEnd() {
    // Do not emit any seek change events after we are done seeking.
    this.clearTimeout(this._seekChangeTimeout);
    // Ensure it is called once last time.
    this.onSeekChange();

    this._seeking = false;
    let finalValue = this.state.seekTime;
    this.setState({ seekTime: null });
    this.props.onSeekEnd(finalValue);
  },

  buildControls() {
    let playOrPause;
    if (this.props.playing) {
      playOrPause = (
        <SystemButton
          onPress={this.props.onPause}
          style={styles.pause}
          type={SystemButton.Pause}
        />
      );
    } else {
      playOrPause = (
        <SystemButton
          onPress={this.props.onPlay}
          style={styles.play}
          type={SystemButton.Play}
        />
      );
    }


    // XXX: Until we are fully ready to support rewinding disallow it unless
    // we are simply slowing down fast forward.
    let canRewind = this.props.rate > 1.0;

    return (
      <View style={styles.controlToolbar}>
        <SystemButton
          enabled={canRewind}
          onPress={this.props.onRewind}
          style={styles.rewind}
          type={SystemButton.Rewind}
        />
        {playOrPause}
        <SystemButton
          onPress={this.props.onFastForward}
          style={styles.fastforward}
          type={SystemButton.FastForward}
        />
      </View>
    );
  },

  buildLiveControls() {
    if (!Config.preferences.showLiveLag) {
      return null;
    }

    // TODO: remove me in production builds
    let lagValue = Date.now() - this.props.currentTime;
    return (
      <Text style={styles.lag}>{lagValue}</Text>
    );
  },

  buildRate() {
    let content;
    if (!this.props.live && this.props.rate > 1.0) {
      content = (<Text style={styles.rate}>{this.props.rate}X</Text>);
    }

    return (
      <View style={styles.rateContainer}>
        {content}
      </View>
    );
  },

  render() {
    // XXX: This is a hack to ensure width is 100%
    let currentTime = this.formatUTCTime(
      this.state.seekTime || this.props.currentTime
    );

    let endTime;
    if (this.props.live) {
      endTime = (<Text style={styles.seekEnd}>Live</Text>);
    } else {
      let endTimeValue = this.formatUTCTime(this.props.endTime);
      endTime = (<Text style={styles.seekEnd}>{endTimeValue}</Text>);
    }

    // The status bar value is represented as seconds in a given day.
    let progress = this.daySeconds(
      this.state.seekTime || this.props.currentTime
    );

    let minimumValue = this.daySeconds(this.props.startTime);
    let maximumTime = this.daySeconds(this.props.endTime);

    let top = (
      <View style={[styles.top]}>
        <View style={styles.seekRow}>
          <SystemButton
            style={styles.done}
            onPress={this.props.onDone}
            type={SystemButton.Done}
          />
          <Text style={styles.seekCurrent}>{currentTime}</Text>
          <SliderIOS
            onValueChange={this.onSeek}
            onSlidingComplete={this.onSeekEnd}
            value={progress}
            minimumValue={minimumValue}
            maximumValue={maximumTime}
            style={styles.seekSlider}
          />
          {endTime}
        </View>
      </View>
    );

    let bottomContent =
      this.props.live ? this.buildLiveControls() : this.buildControls();

    let rate = this.buildRate();

    let bottom = (
      <View style={[styles.bottom]}>
        <View style={styles.placeholder} />
        {bottomContent}
        {rate}
      </View>
    );

    return (
      <View pointerEvents="box-none" style={this.props.style}>
        {top}
        {bottom}
      </View>
    );
  },
});

var styles = StyleSheet.create({
  top: {
    paddingBottom: 5,
    backgroundColor: 'gray',
    opacity: 0.5,
    left: 0,
    top: 0,
  },

  seekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  done: {
    color: 'black',
    flex: 0.1,
    height: 35,
  },

  seekCurrent: {
    textAlign: 'center',
    flex: 0.15,
  },

  seekSlider: {
    flex: 0.60,
  },

  seekEnd: {
    textAlign: 'center',
    flex: 0.15,
  },

  bottom: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
    position: 'absolute',
    backgroundColor: 'gray',
    opacity: 0.5,
    right: 0,
    bottom: 0,
    left: 0,
  },

  lag: {
    fontFamily: 'AppleSDGothicNeo-SemiBold',
    color: 'red',
  },

  controlToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  pause: {
    color: 'black',
    height: 35,
    width: 50,
  },

  play: {
    color: 'black',
    height: 35,
    width: 50,
  },

  fastforward: {
    color: 'black',
    height: 35,
    width: 50,
  },

  rate: {
    fontSize: 15,
    padding: 4,
  },

  rateContainer: {
    flex: 0.1,
    alignItems: 'flex-end',
  },

  rewind: {
    color: 'black',
    height: 35,
    width: 50,
  },

  placeholder: {
    flex: 0.1,
    alignItems: 'flex-start',
  },
});
