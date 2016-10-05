import React from 'react';
import { Panel } from 'react-bootstrap';
import Api from '../libraries/Api';

const MAX_EVENTS = 1000;

function timeString(stampMs) {
  return new Date(stampMs).toLocaleTimeString();
}

const styles = {
  flexRow: {
    display: 'flex',
    flexWrap: 'wrap',
  },
};

class Events extends React.Component {
  state = {
    previews: [],
    previewIndex: 0,
  };

  previewTimer = null;

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
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
      const event = this.props.params;
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
      this.setState({msg: `Error: ${err}`});
    }
  }

  render() {
    const event = this.props.params;

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
          <img width="320" height="180"
            src={previewUrl}
            alt="Preview not available"
          />
          <br/>
          <small><i>{rawData}</i></small>
        </Panel>
    );
  }
}

export default class EventViewer extends React.Component {
  state = {
    events: [],
    msg: '',
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  componentWillMount() {
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

  render() {
    let events = this.state.events.map(event => {
      return <Events params={event} />;
    });
    return (
      <div>
        <h4> {this.state.events.length} recent events</h4>
        <small><i>{this.state.msg}</i></small>
        <p/>
        <p/>
        <div style={styles.flexRow}>{events}</div>
      </div>
    );
  }
}
