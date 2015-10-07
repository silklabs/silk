/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// NB: we import the chart.js and StackedBar modules here just for the
// side effect of having StackedBar "attach" itself to chart.js as a
// "plugin".  (Yes, this is gross.)
import chartjs from 'chart.js';
import 'Chart.StackedBar.js';
import React from 'react';
import { createClass as createChartClass } from 'react-chartjs';
import { Button, ButtonToolbar, Glyphicon } from 'react-bootstrap';
import { Link } from 'react-router';

import Cameras from '../libraries/Cameras';

const StackedBarChart = createChartClass('StackedBar', ['getBarsAtEvent']);

const EVENT_SEQUENCE = [
  'recordStartMs',
  'recordEndMs',
  'arriveAppMs',
  'playbackStartMs',
  'playbackEndMs',
];
const FIRST_EVENT = EVENT_SEQUENCE[0];


// How many rows (segments) we display in the chart.  This number is
// picked arbitrarily because it fits well on cjones's monitor.  A
// better approach might be to compute the number dynamically from
// available window width/height based on some heuristics.
const MAX_NR_SEGMENTS = 20;

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

export default class AVPipeline extends React.Component {
  // True when the user has stopped playback, and we should clear out
  // all old segment information when receiving the next update
  // packet.
  playbackExited = false;
  state = {
    camera: null,
    lastNowMs: null,
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
    // We know that `event` isn't an 'exit' event, so the `id` and
    // `nowMs` properties aren't optional.  For segment events, the
    // `id` field is the stringified timestamp for the start of video
    // recording.
    let id = event.id;
    if (!(id in segments)) {
      segments[id] = { id };
    }
    segments[id][event.what + 'Ms'] = event.whenMs;
    this.setState({
      lastNowMs: event.nowMs,
      segments: this.filterSegments(segments, MAX_NR_SEGMENTS),
    });
  };

  onPause = () => {
    alert('NYI: real pause');   // eslint-disable-line
  };

  filterSegments(segments, nrKeep) {
    let ids =
          Object.keys(segments)
          .filter(id => FIRST_EVENT in segments[id])
          .sort((a, b) => segments[b][FIRST_EVENT] - segments[a][FIRST_EVENT])
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
        return segmentEvents[eventName] - lastEventMs;
      }));
    });
    // The `darkMatterSeries` covers what happens between stopping
    // recording up to receiving the mp4 segment in the app.  This
    // time is unassigned, hence "dark matter".
    let [/*nullSeries*/,
      recordingSeries, darkMatterSeries, queuedSeries, playingSeries
    ] = series;
    let data = {
      labels,
      datasets: [
        {
          label: 'playing',
          fillColor: 'green',
          data: playingSeries,
        },
        {
          label: 'queued',
          fillColor: 'yellow',
          data: queuedSeries,
        },
        {
          label: 'darkMatter',
          fillColor: 'black',
          data: darkMatterSeries,
        },
        {
          label: 'recording',
          fillColor: 'red',
          data: recordingSeries,
        },
        {
          label: '',
          fillColor: 'rgba(0,0,0,0)',
          strokeColor: 'rgba(0,0,0,0)',
          pointColor: 'rgba(0,0,0,0)',
          pointStrokeColor: 'rgba(0,0,0,0)',
          pointHighlightFill: 'rgba(0,0,0,0)',
          pointHighlightStroke: 'rgba(0,0,0,0)',
          data: nullSeries,
        },
      ],
    };
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
          .sort((a, b) => segments[b].arriveAppMs - segments[a].arriveAppMs)
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
        </ButtonToolbar>
        {content}
      </div>
    );
  }
}
