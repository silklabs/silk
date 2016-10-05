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

export default class EventViewer extends React.Component {
  state = {
    events: [],
    msg: '',
    workingHard: true,
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
      for (let event of events) {
        const preview = await Api.metadata.findAllInTimeInterval({
          deviceId: this.deviceId,
          startTime: event.startUTC,
          endTime: event.startUTC,
          metaType: 'preview',
          maxCount: 1,
        });
        if (preview.length === 1) {
          event.previewUrl = preview[0].url;
        }
      }
      this.setState({events, msg: '', workingHard: false});
    } catch (err) {
      this.setState({msg: `Error: ${err}`, workingHard: false});
    }
  }

  render() {
    let events = this.state.events.map(event => {
      const eventDuration = `${timeString(event.startUTC)} - ${timeString(event.endUTC)}`;
      let previewImage;
      if (event.previewUrl) {
        previewImage = <img src={event.previewUrl}/>;
      } else {
        previewImage = <i>Preview not available</i>;
      }
      const rawData = <small><pre>{JSON.stringify(event.data)}</pre></small>;
      let eventName;
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
        break;
      }
      return (
          <Panel header={eventName + ' | ' + eventDuration}>
            {previewImage}
            {eventName ? '' : rawData}
          </Panel>
      );
    });
    return (
      <div>
        <h5>
          {this.state.events.length} recent events
        </h5>
        <small><i>{this.state.msg}</i></small>
        <p/>
        <p/>
        <div style={styles.flexRow}>{events}</div>
      </div>
    );
  }
}
