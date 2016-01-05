
// NB: we import the chart.js and StackedBar modules here just for the
// side effect of having StackedBar "attach" itself to chart.js as a
// "plugin".  (Yes, this is gross.)
import chartjs from 'chart.js';
import 'Chart.StackedBar.js';
import React from 'react';
import { createClass as createChartClass } from 'react-chartjs';
import { Button, ButtonToolbar, Glyphicon,
         ListGroup, ListGroupItem,
         OverlayTrigger, Popover } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';

const StackedBarChart = createChartClass('StackedBar', ['getBarsAtEvent']);

const EVENT_SEQUENCE = [
  'recordStart',
  'recordEnd',
  'deviceDrop',
  'deviceEmit',
  'serverEmit',
  'arriveApp',
  'playbackEnqueued',
  'playbackStart',
  'segmentDuration',
  'playbackEnd',
].map(eventName => eventName + 'Ms');
const FIRST_EVENT = EVENT_SEQUENCE[0];

const SERIES = {
  spacer: {
    color: 'rgba(0,0,0,0)',
    desc: '',
  },
  // recordStart vvv
  recording: {
    color: 'red',
    desc: `Time between AV segment recording start / stop`,
  },
  // ^^^ recordEnd vvv
  deviceQueued: {
    color: 'gray',
    desc: `Time between segment enqueued in 'capture' process to be sent over socket, up to segment enqueued for server upload in silk-core process by 'socket.emit(segment)'`,
  },
  // ^^^ deviceDrop vvv
  deviceDropped: {
    color: 'rgba(220,192,203,0.3)',
    desc: `(Segment was dropped on the floor because too many server acks became pending)`,
  },
  // ^^^ deviceEmit vvv
  darkMatterUpload: {
    color: 'blue',
    desc: `"Dark matter", unclassified time, between 'socket.emit(segment)' on the device side and the segment being received ('socket.on(...)') on the server side`,
  },
  // ^^^ serverEmit vvv
  darkMatterDownload: {
    color: 'black',
    desc: `"Dark matter", unclassified time, between 'socket.emit(segment)' on the server side and the segment being received ('socket.on(...)') on the app side`,
  },
  // ^^^ arriveApp vvv
  loadAsset: {
    color: 'orange',
    desc: `Time spent loading and processing the segment before it's enqueued for playback`,
  },
  // ^^^ playbackEnqueued vvv
  playbackQueued: {
    color: 'yellow',
    desc: `Time the AV segment spends in the playback queue before being played`,
  },
  // ^^^ playbackStart vvv
  segmentDuration: {
    color: 'green',
    desc: `Time the segment is actually being played in the playback widget`,
  },
  // ^^^ segmentDuration vvv
  playbackEncore: {
    color: 'purple',
    desc: `Time the already-played segment "lingers" in the playback widget because the next segment isn't ready to be played yet`,
  },
  // ^^^ playbackEnd
};

/**
 * Return <0 if `a` happened before `b`, 1 if `a` happened after `b`,
 * and 0 otherwise.  Happens-before is defined on the timestamp of the
 * first event we track.
 */
function cmpSegmentTimestamps(a, b) {
  return a[FIRST_EVENT] - b[FIRST_EVENT];
}

/**
 * If `eventIdx` is missing from `segment`, add it with the value
 * `nextValue`.  Then recursively backfill all events *before*
 * `eventIdx` with the value from the event that happened most
 * recently after the missing event.  But stop backfilling at
 * `stopIdx`.
 *
 * For example, if `segment` is
 *
 *   [   , 23,   , 42,   ,    ]
 *
 * then `backfill(segment, 5, 66, 0)` will update `segment` to
 *
 *   [   , 23, 42, 42, 66, 66 ]
 */
function backfillMissingEvents(segment, eventIdx, nextValue, stopIdx = -1) {
  if (eventIdx <= stopIdx) {
    return;
  }
  let eventProp = EVENT_SEQUENCE[eventIdx];
  if (!(eventProp in segment)) {
    segment[eventProp] = nextValue;
  }
  backfillMissingEvents(segment, eventIdx - 1, segment[eventProp]);
}

// Don't animate when the chart redraws.
chartjs.defaults.global.animation = false;

class HorizontalStackedBarChart extends React.Component {
  render() {
    let props = Object.assign({}, this.props);
    let { width, height } = props;
    props.width = height;
    props.height = width;
    if (!props.style) {
      props.style = {};
    }
    props.style.transform = `rotate(90deg) translateX(-${width}px)`;
    props.style.transformOrigin = 'bottom left';
    return (<StackedBarChart {...props} />);
  }
}

class Slider extends React.Component {
  static propTypes = {
    defaultValue: React.PropTypes.number,
    min: React.PropTypes.number,
    max: React.PropTypes.number,
    onChange: React.PropTypes.func,
    step: React.PropTypes.number,
    style: React.PropTypes.object,
  };
  static defaultProps = {
    onChange: () => undefined,
    min: 0,
    max: 100,
    step: 1,
  };

  state = {
    value: (this.props.defaultValue
            || (this.props.min + (this.props.max - this.props.min) / 2)),
  };

  onChange = e => {
    this.setState({ value: e.target.value });
    this.props.onChange(this.state.value);
  }

  render() {
    return (
      <input
        type="range"
        min={this.props.min}
        max={this.props.max}
        value={this.state.value}
        onChange={this.onChange}
        style={this.props.style}
      />
    );
  }
}

class LegendLabel extends React.Component {
  render() {
    if ('spacer' === this.props.name) {
      return (<span />);
    }
    let box = {
      width: '100px',
      height: '20px',
      backgroundColor: this.props.color,
    };
    return (
      <ListGroupItem>
        <div style={box} /> {this.props.desc}
      </ListGroupItem>
    );
  }
}

class Legend extends React.Component {
  render() {
    let labels = Object.keys(SERIES).map(name => (
      <LegendLabel
        key={name} name={name}
        color={SERIES[name].color} desc={SERIES[name].desc}
      />
    ));
    return (
      <Popover id="legend" title="Legend">
        <ListGroup>{labels}</ListGroup>
      </Popover>
    );
  }
}

export default class AVPipeline extends React.Component {
  // True when the user has stopped playback, and we should clear out
  // all old segment information when receiving the next update
  // packet.
  playbackExited = false;
  state = {
    camera: null,
    lastNowMs: null,
    // How many rows (segments) we display in the chart.  This number
    // is picked arbitrarily because it fits well on cjones's monitor.
    // A better approach might be to compute the number dynamically
    // from available window width/height based on some heuristics.
    maxNrSegments: 20,
    paused: false,
    segments: {},
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  //--------------------------------------------------
  // TODO: vvv refactor into DiagListener helper
  componentWillMount() {
    Cameras.on('stateChanged', this.onCamerasStateChanged);
    this.onCamerasStateChanged(Cameras);
  }

  componentWillUnmount() {
    Cameras.removeListener('stateChanged', this.onCamerasStateChanged);
    let camera = this.state.camera;
    if (camera) {
      camera.logging = false;
      camera.removeListener('diag', this.onDiag);
    }
  }

  onCamerasStateChanged = state => {
    let oldCamera = this.state.camera;
    let newCamera = state.cameras[this.deviceId];

    if (oldCamera === newCamera) {
      return;
    }
    if (oldCamera) {
      oldCamera.logging = false;
      oldCamera.removeListener('diag', this.onDiag);
    }
    if (newCamera) {
      newCamera.logging = true;
      newCamera.on('diag', this.onDiag);
    }
    this.setState({ camera: newCamera });
  };
  // TODO: ^^^
  //--------------------------------------------------

  onDiag = msg => {    // msg : { id : String, type : String, log : Any }
    if ('avpipeline' !== msg.type) {
      return;
    }
    let segments = this.state.segments;
    // We know that |msg| is an 'avpipeline' message, so we know that
    // `msg.log` is the narrower type
    //
    //   event : { what : String, whenMs : Number,
    //             Optional<id : String>, Optional<nowMs : Number> }
    let event = msg.log;
    if ('exit' === event.what) {
      // Defer clearing the old segment data until playback resumes,
      // so that we still have something to draw on the graph.
      this.playbackExited = true;
      return;
    }
    if (this.playbackExited) {
      this.playbackExited = false;
      segments = {};
    }
    let eventProp = event.what + 'Ms';
    let eventIdx = EVENT_SEQUENCE.indexOf(eventProp);
    if (eventIdx < 0) {
      console.warn(`Ignoring unknown avpipeline event "${event.what}"`);
      return;
    }
    // We know that `event` isn't an 'exit' event, so the `id` and
    // `nowMs` properties aren't optional.  For segment events, the
    // `id` field is the stringified timestamp for the start of video
    // recording.
    let id = event.id;
    if (!(id in segments)) {
      segments[id] = { id };
    }
    segments[id][eventProp] = event.whenMs;
    // The delta between each pair of successive events x, y creates a
    // bar in the generated chart. The problem to solve is that if the
    // webapp version is a little older or newer than the system it's
    // monitoring, event x might not exist. In that case, we don't
    // want to drop all the data --- rather this "backfill" sets
    // things up so that the slot for x gets the value of y. Then the
    // bar between x and y on the generated chart has zero width, and
    // whatever event interval it's supposed to represent effectively
    // doesn't exist. And then we recursively apply that backfill to
    // the previous event of x, and so on.
    //
    // The backfill stops before FIRST_EVENT because we use that to
    // sort the segments --- if FIRST_EVENT never occurred then we
    // just drop the segment.
    //
    // And we're slightly abusing this helper to hide the "segment
    // dropped" bar for all segments that aren't dropped. For those
    // segments, the device side just doesn't send the deviceDrop
    // event, and so that slot takes on the value of deviceEmit, its
    // successor, making the "dropped" bar in the chart have zero
    // width.
    backfillMissingEvents(segments[id], eventIdx - 1, event.whenMs, 0);
    this.setState({
      lastNowMs: event.nowMs || this.state.lastNowMs,
      segments: this.filterSegments(segments, this.state.maxNrSegments),
    });
  };

  onMaxSegmentsChange = value => {
    this.setState({ maxNrSegments: parseInt(value) });
  }

  onPause = () => {
    alert('NYI: real pause');   // eslint-disable-line
  };

  filterSegments(segments, nrKeep) {
    let ids =
          Object.keys(segments)
          .filter(id => FIRST_EVENT in segments[id])
          .sort((a, b) => cmpSegmentTimestamps(segments[b], segments[a]))
          .slice(0, nrKeep);
    let filtered = {};
    ids.forEach(id => filtered[id] = segments[id]);
    return filtered;
  }

  renderChart(sortedSegments) {
    // "Zero" time point is the first event from the oldest segment.
    let zeroMs = sortedSegments[sortedSegments.length - 1][FIRST_EVENT];
    let nowMs = this.state.lastNowMs;
    let labels = sortedSegments.map(events => events.id.slice(-5));
    // Empty "bar" that represents the time before the first event we
    // received.  We filter out segment data that doesn't include this
    // first event, so it's guaranteed to be present.
    let nullSeries = sortedSegments.map(events => events[FIRST_EVENT] - zeroMs);
    // The data series we generate as time deltas between successive
    // events.  The series starts with the "null timestamp", which
    // marks when the first event was recorded for a given chunk.
    // Then with each iteration of the forEach below, we tack on a new
    // series that's the delta from the last.
    let series = [ nullSeries ];
    EVENT_SEQUENCE.slice(1).forEach((eventName, eventIdx) => {
      let lastEventName = EVENT_SEQUENCE[eventIdx];
      series.push(sortedSegments.map((segmentEvents, segmentIdx) => {
        if (!(lastEventName in segmentEvents)) {
          return 0;
        }
        let lastEventMs = segmentEvents[lastEventName];
        if (!(eventName in segmentEvents)) {
          return nowMs - lastEventMs;
        }
        // Some events may be timestamped after the most recent "now",
        // so limit our view of time to that most recent now.
        return Math.min(nowMs, segmentEvents[eventName]) - lastEventMs;
      }));
    });
    let datasets = Object.keys(SERIES).map((name, seriesIdx) => {
      let dataset = {
        label: name,
        fillColor: SERIES[name].color,
        data: series[seriesIdx],
      };
      if ('deviceDropped' === name) {
        dataset.strokeColor = 'rgba(220,192,203,0.8)';
        dataset.highlightFill = 'rgba(220,192,203,0.8)';
        dataset.highlightStroke = 'rgba(220,192,203,1)';
      } else if ('spacer' === name) {
        dataset.strokeColor = 'rgba(0,0,0,0)';
        dataset.pointColor = 'rgba(0,0,0,0)';
        dataset.pointStrokeColor = 'rgba(0,0,0,0)';
        dataset.pointHighlightFill = 'rgba(0,0,0,0)';
        dataset.pointHighlightStroke = 'rgba(0,0,0,0)';
      }
      return dataset;
    });
    datasets.reverse();
    let data = { labels, datasets };
    // TODO: listen for SIGWINCH and redraw
    let width = window.innerWidth;
    let height = window.innerHeight;
    // NB: passing `redraw=true` to work around apparent bug in
    // react-chartjs where it doesn't properly handle datasets with
    // added / removed bars.
    return (
      <HorizontalStackedBarChart
        data={data} width={width} height={height} redraw={true}
      />
    );
  }

  render() {
    let segments = this.state.segments;
    // Sort descending by timestamp
    let sortedSegments =
          Object.keys(segments)
          .sort((a, b) => cmpSegmentTimestamps(segments[b], segments[a]))
          .map(id => segments[id]);
    let content = (sortedSegments.length ?
                   this.renderChart(sortedSegments) :
                   (<div>No segment progress to show</div>));
    return (
      <div>
        <ButtonToolbar>
          <Button bsStyle="warning">
            <Link to="/"><Glyphicon glyph="home" /></Link>
          </Button>
          <Button onClick={this.onPause}>
            <Glyphicon glyph="pause" />
          </Button>
          <OverlayTrigger
            trigger="click" rootClose placement="bottom"
            overlay={<Legend />}>
            <Button bsStyle="info">Legend</Button>
          </OverlayTrigger>
        </ButtonToolbar>
        <Slider
          min={1}
          max={50}
          defaultValue={20}
          onChange={this.onMaxSegmentsChange}
          style={{ width: '25%', display: 'inline' }}
        />
        <span>&nbsp;Showing max {this.state.maxNrSegments} segments</span>
        {content}
      </div>
    );
  }
}
