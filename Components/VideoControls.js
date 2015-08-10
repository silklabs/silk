import React from 'react-native'
import Button from 'react-native-button';

import moment from 'moment';

let {
  StyleSheet,
  Text,
  View,
  SliderIOS
} = React;

export default React.createClass({
  getInitialState() {
    return {
      // null when we are not seeking a number otherwise.
      seekTime: null
    };
  },

  getInitialProps() {
    let noop = function(){};
    return {
      live: false,
      onDone: noop,
      onSeekEnd: noop,
      onSeek: noop,
      onSeekStart: noop,
      startTime: 0,
      endTime: 0,
      currentTime: 0
    }
  },

  propTypes: {
    width: React.PropTypes.number.isRequired,
    height: React.PropTypes.number.isRequired,
    startTime: React.PropTypes.number.isRequired,
    currentTime: React.PropTypes.number.isRequired,
    endTime: React.PropTypes.number.isRequired,
    onDone: React.PropTypes.func,
    onSeekStart: React.PropTypes.func,
    onSeek: React.PropTypes.func,
    onSeekEnd: React.PropTypes.func,
    live: React.PropTypes.bool
  },

  _seeking: false,

  formatUTCTime(time) {
    return  moment(new Date(time)).format(
      'h:mm:ss a'
    );
  },

  dayStart() {
    let date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  },

  daySeconds(time) {
    let date = new Date(time)
    let start = this.dayStart();
    // Number of elapsed seconds in the given day.
    return Math.ceil((date.valueOf() - start.valueOf()) / 1000);
  },

  onSeekStart() {
  },

  onSeek(value) {
    let absoluteValue = this.dayStart().valueOf() + (value * 1000);
    this.setState({ seekTime: absoluteValue });
    this.props.onSeek(absoluteValue);

    if (!this._seeking) {
      this._seeking = true;
      this.props.onSeekStart(absoluteValue);
    }
  },

  onSeekEnd() {
    this._seeking = false;
    let finalValue = this.state.seekTime;
    this.setState({ seekTime: null });
    this.props.onSeekEnd(finalValue);
  },

  render() {
    // XXX: This is a hack to ensure width is 100%
    let dimensions = {
      width: this.props.width,
      height: this.props.height
    };

    let currentTime = this.formatUTCTime(
      this.state.seekTime || this.props.currentTime
    );

    let endTime;
    if (this.props.live) {
      endTime = (<Text style={styles.seekEnd}>Live</Text>)
    } else {
      let endTimeValue = this.formatUTCTime(this.props.maximumValue);
      endTime = (<Text style={styles.seekEnd}>{endTimeValue}</Text>)
    }

    // The status bar value is represented as seconds in a given day.
    let progress = this.daySeconds(
      this.state.seekTime || this.props.currentTime
    );

    let minimumValue = this.daySeconds(this.props.startTime);
    let maximumTime = this.daySeconds(this.props.endTime);
    let lag;
    if (this.props.live) {
      let lagValue = Date.now() - this.props.currentTime;
      lag = <Text style={styles.lag}>{lagValue}</Text>
    }

    let top = (
      <View style={[styles.top, { width: dimensions.width }]}>
        <View style={styles.seekRow}>
          <Button onPress={this.props.onDone} style={styles.done}>Done</Button>
          <Text style={styles.seekCurrent}>{currentTime}</Text>
          <SliderIOS
            onValueChange={this.onSeek}
            onSlidingComplete={this.onSeekEnd}
            value={progress}
            minimumValue={minimumValue}
            maximumValue={maximumTime}
            style={styles.seekSlider} />
          {endTime}
        </View>
      </View>
    );

    let bottom = (
      <View style={[styles.bottom, { width: dimensions.width }]}>
        {lag}
      </View>
    );

    return (
      <View pointerEvents="box-none" style={dimensions}>
        {top}
        {bottom}
      </View>
    );
  }
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
    flexDirection: 'row', alignItems: 'center'
  },

  done: {
    color: 'black',
    flex: 0.1,
  },

  seekCurrent: {
    textAlign: 'center',
    flex: 0.15
  },

  seekSlider: {
    flex: 0.60
  },

  seekEnd: {
    textAlign: 'center',
    flex: 0.15
  },

  bottom: {
    alignItems: 'center',
    padding: 3,
    position: 'absolute',
    backgroundColor: 'gray',
    opacity: 0.5,
    bottom: 0,
    left: 0,
  },

  lag: {
    fontFamily: 'AppleSDGothicNeo-SemiBold',
    color: 'red',
  }
});
