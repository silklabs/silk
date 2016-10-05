import React from 'react';
import {Panel} from 'react-bootstrap';
import Api from '../libraries/Api';
import {MSEPlayer} from 'silk-mse-player';
import createLog from 'silk-log';
const log = createLog('EventVideo');

const MAX_EVENTS = 50;

function timeString(stampMs) {
  return new Date(stampMs).toLocaleTimeString();
}

const styles = {
  flexRow: {
    display: 'flex',
    flexWrap: 'wrap',
  },
};

class Event extends React.Component {
  state = {
    previews: [],
    previewIndex: 0,
  };

  previewTimer = null;

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    this.loadImages();
  }

  componentWillUnmount() {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }

  async loadImages() {
    try {
      const event = this.props.params.event;
      const previews = await Api.metadata.findAllInTimeInterval({
        deviceId: this.deviceId,
        startTime: event.startUTC,
        endTime: event.endUTC,
        metaType: 'preview',
        maxCount: 100,
      });
      this.setState({previews, previewIndex: 0});

      if (previews.length > 1) {
        this.previewTimer = setInterval(
          () => {
            let previewIndex = this.state.previewIndex - 1;
            if (previewIndex < 0) {
              previewIndex = this.state.previews.length - 1;
            }
            this.setState({previewIndex});
          },
          250 // 4x normal speed
        );
      }
    } catch (err) {
      log.error(`Error: ${err}`);
    }
  }

  render() {
    const event = this.props.params.event;

    const eventStart = timeString(event.startUTC);
    const eventDuration = ((event.endUTC - event.startUTC) / 1000).toFixed(1) + 's';
    let previewUrl;
    let eventName;
    let rawData;

    if (this.state.previews.length > 0) {
      previewUrl = this.state.previews[this.state.previewIndex].url;
      if (this.state.previews.length > 1) {
        rawData = timeString(this.state.previews[this.state.previewIndex].startUTC);
      }
    }

    switch (event.data.tag) {
    case 'motion':
      eventName = 'Motion';
      break;
    case 'object':
    case 'face':
      eventName = event.data.name;
      break;
    default:
      eventName = 'UNKNOWN EVENT TAG';
      rawData = <pre>{JSON.stringify(event.data)}</pre>;
      break;
    }
    const header = `${eventName} | ${eventStart} (${eventDuration})`;
    return (
        <Panel header={header}>
          <img
            width="320" height="180"
            src={previewUrl}
            alt="Preview not available"
            onClick={() => this.props.params.onPlayVideo(event.startUTC, event.endUTC)}
          />
          <br/>
          <small><i>{rawData}</i></small>
        </Panel>
    );
  }
}


class EventVideoPlayer extends React.Component {
  abortFetching = false;
  finishedFetching = false;

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    this.loadSegments();
  }

  componentWillUnmount() {
    this.abortFetching = true;
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }
  }

  async loadSegments() {
    try {
      const segments = await Api.metadata.findAllInTimeInterval({
        deviceId: this.deviceId,
        startTime: this.props.params.startUTC,
        endTime: this.props.params.endUTC,
        metaType: 'video',
        maxCount: 60 * 5, // At one video segment a second don't bother loading
                          // more than 5 minutes until we build a better UI
      });
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];

        if (this.abortFetching) {
          break;
        }
        log.info('Fetching segment', i, '-', segment.url);
        const resp = await fetch(segment.url);
        const ab = await resp.arrayBuffer();
        log.info('Feeding segment', i, 'from',
          timeString(segment.startUTC), 'to', timeString(segment.endUTC));
        if (!this.refs.player) {
          log.error('No player, abort loadSegments');
          break;
        }
        this.refs.player.feedSegmentData(ab, segment.startUTC);
      }
      this.finishedFetching = true;
    } catch (err) {
      log.error(`Error: ${err}`);
    }
  }

  onClick = () => {
    if (this.props.params.onPlaybackCancelled) {
      this.props.params.onPlaybackCancelled();
    }
  };

  onStalled = () => {
    if (this.finishedFetching) {
      if (this.props.params.onPlaybackComplete) {
        this.props.params.onPlaybackComplete();
        return;
      }
    }
    log.error('Playback stalled');
  };

  render() {
    return (
      <MSEPlayer
        autoPlay="true"
        onClick={this.onClick}
        onStalled={this.onStalled}
        ref="player"
      />
    );
  }
}

export default class EventViewer extends React.Component {
  state = {
    events: [],
    msg: '',
    video: null,
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentDidMount() {
    this.findEvents();
  }

  async findEvents() {
    this.setState({msg: `Querying last ${MAX_EVENTS} events...`});

    try {
      const events = await Api.metadata.findAllBeforeTime({
        deviceId: this.deviceId,
        time: Date.now(),
        metaType: 'event',
        maxCount: MAX_EVENTS,
      });

      this.setState({msg: `Loading event previews...`});
      this.setState({events, msg: ''});
    } catch (err) {
      this.setState({msg: `Error: ${err}`});
    }
  }

  playVideo = (startUTC, endUTC) => {
    log.info('Starting video playback', startUTC, endUTC);
    this.setState({video: {startUTC, endUTC}});
  };

  stopVideo = () => {
    log.info('Stopping video playback');
    this.setState({video: null});
  };

  render() {
    let content;
    if (this.state.video) {
      content = (
        <EventVideoPlayer
          params={{
            deviceId: this.deviceId,
            startUTC: this.state.video.startUTC,
            endUTC: this.state.video.endUTC,
            onPlaybackComplete: this.stopVideo,
            onPlaybackCancelled: this.stopVideo,
          }}
        />
      );
    } else {
      const events = this.state.events.map(event => {
        return (
          <Event
            params={{
              deviceId: this.deviceId,
              event,
              onPlayVideo: this.playVideo,
            }}
          />
        );
      });
      content = <div style={styles.flexRow}>{events}</div>;
    }

    return (
      <div>
        <h4> {this.state.events.length} recent events</h4>
        <small><i>{this.state.msg}</i></small>
        <p/>
        {content}
      </div>
    );
  }
}
