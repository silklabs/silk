import moment from 'moment';
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  SliderIOS,
} from 'react-native';

import Config from '../libraries/Config';
import * as DateUtil from '../libraries/DateUtil';
import SystemButton from './SystemButton';

function daySeconds(time) {
  let date = new Date(time);
  let start = DateUtil.startOfDay();
  // Number of elapsed seconds in the given day.
  return Math.ceil((date.valueOf() - start.valueOf()) / 1000);
}

function formatUTCTime(time) {
  return moment(new Date(time)).format(
    'h:mm:ss a'
  );
}

export default React.createClass({

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
      currentTime: null,
    };
  },

  propTypes: {
    style: View.propTypes.style,
    playing: React.PropTypes.bool,
    seekChangeThreshold: React.PropTypes.number,
    startTime: React.PropTypes.number.isRequired,
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
  _seekChangeTimeout: null,

  componentWillUnmount() {
    clearTimeout(this._seekChangeTimeout);
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

    clearTimeout(this._seekChangeTimeout);
    this._seekChangeTimeout = setTimeout(
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
    clearTimeout(this._seekChangeTimeout);
    // Ensure it is called once last time.
    this.onSeekChange();

    this._seeking = false;
    let finalValue = this.state.seekTime;
    this.setState({ seekTime: null });
    this.props.onSeekEnd(finalValue);
  },

  _renderControls() {
    let playOrPause;
    if (this.props.playing) {
      playOrPause = (
        <SystemButton
          color="black"
          onPress={this.props.onPause}
          style={styles.pause}
          type={SystemButton.Pause}
        />
      );
    } else {
      playOrPause = (
        <SystemButton
          color="black"
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
          color="black"
          enabled={canRewind}
          onPress={this.props.onRewind}
          style={styles.rewind}
          type={SystemButton.Rewind}
        />
        {playOrPause}
        <SystemButton
          color="black"
          onPress={this.props.onFastForward}
          style={styles.fastforward}
          type={SystemButton.FastForward}
        />
      </View>
    );
  },

  _renderLiveControls() {
    if (!Config.get().preferences.showLiveLag) {
      return null;
    }

    if (this.props.currentTime === null) {
      return null;
    }

    // TODO: remove me in production builds
    let lagValue = Date.now() - this.props.currentTime;
    return (
      <Text style={styles.lag}>{lagValue}</Text>
    );
  },

  _renderRate() {
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
    let currentTime = null;
    let progress = null;
    if (this.state.seekTime !== null) {
      currentTime = formatUTCTime(this.state.seekTime);
      progress = daySeconds(this.state.seekTime);
    } else if (this.props.currentTime !== null) {
      currentTime = formatUTCTime(this.props.currentTime);
      progress = daySeconds(this.props.currentTime);
    }

    let endTime;
    if (this.props.live) {
      endTime = (<Text style={styles.seekEnd}>Live</Text>);
    } else {
      let endTimeValue = formatUTCTime(this.props.endTime);
      endTime = (<Text style={styles.seekEnd}>{endTimeValue}</Text>);
    }

    let minimumValue = daySeconds(this.props.startTime);
    let maximumTime = daySeconds(this.props.endTime);

    let top = (
      <View style={[styles.top]}>
        <View style={styles.seekRow}>
          <SystemButton
            color="black"
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
      this.props.live ? this._renderLiveControls() : this._renderControls();

    let bottom = (
      <View style={[styles.bottom]}>
        <View style={styles.placeholder} />
        {bottomContent}
        {this._renderRate()}
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

const styles = StyleSheet.create({
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
    height: 35,
    width: 50,
  },

  play: {
    height: 35,
    width: 50,
  },

  fastforward: {
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
    height: 35,
    width: 50,
  },

  placeholder: {
    flex: 0.1,
    alignItems: 'flex-start',
  },
});
