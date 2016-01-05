
import React from 'react';
import { Tab, Tabs } from 'react-bootstrap';
import Api from '../libraries/Api';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

// A gap is considered to exist when the number of milliseconds between
// sequential metadata exceed this value.
//
// This number was derived from the fact that preview images are uploaded every
// 1 second (plus an overhead of usually < 200ms)
const GAP_TOLERANCE_MS = 1200;

function timeString(stampMs) {
  return new Date(stampMs).toLocaleTimeString();
}

class VideoChunks extends React.Component {
  state = {
    queryTime: null,
    msg: '',
    mostRecentTime: null,
    gaps: [],
    workingHard: true,
  };

  get deviceId() {
    return this.props.params.deviceId;
  }

  constructor(props) {
    super(props);
    this.state.queryTime = this.state.mostRecentTime = Date.now();
  }

  componentWillMount() {
    this.findGaps();
  }

  findGaps() {
    this.setState({
      msg: `Querying 1000 chunks before ${timeString(this.state.queryTime)}...`,
    });
    Api.metadata.findAllBeforeTime({
      deviceId: this.deviceId,
      time: this.state.queryTime,
      metaType: this.props.metaType,
      maxCount: 1000,
    })
    .then(chunks => {
      let gaps = this.state.gaps;
      let lastTime = this.state.queryTime;
      for (let chunk of chunks) {
        let gap = lastTime - chunk.endUTC;
        if (gap > GAP_TOLERANCE_MS) {
          gaps.push({ start: chunk.endUTC, end: lastTime });
        }
        lastTime = chunk.startUTC;
      }
      let earliestChunk = chunks[chunks.length - 1];
      this.setState({ gaps: gaps, queryTime: earliestChunk && earliestChunk.startUTC });
      if (this.state.mostRecentTime - this.state.queryTime
          < TWELVE_HOURS_MS) {
        this.findGaps();
      } else {
        this.setState({msg: '', workingHard: false});
      }
    })
    .catch(err => this.setState({msg: `Error: ${err}`, workingHard: false}));
  }

  render() {
    let gaps = this.state.gaps.map(gap => {
      let gapSecs = (gap.end - gap.start) / 1000.0;
      return (
        <li>
          {gapSecs.toFixed(1)} secs
          ({(gapSecs / 60).toFixed(1)} mins, {gap.end - gap.start}ms)
          :&nbsp;
          {timeString(gap.start)} - {timeString(gap.end)}
        </li>
      );
    });
    return (
      <div>
        <h5>
          12 hours of {this.props.metaType} chunks from
          &nbsp;{timeString(this.state.queryTime)} to
          &nbsp;{timeString(this.state.mostRecentTime)}
        </h5>
        <small><i>{this.state.msg}</i></small>
        <p/>
        <b>{this.state.gaps.length} gaps
           {this.state.workingHard && ' (but still working...)'}:</b>
        <ol>{gaps}</ol>
      </div>
    );
  }
}

export default class MissingChunks extends React.Component {
  state = { key: 0 };

  render() {
    return (
        <div>
          <Tabs
            activeKey={this.state.key}
            onSelect={key => this.setState({key})}>
            {
              ['video', 'preview'].map((value, index) =>
                <Tab eventKey={index} title={value}>
                  <VideoChunks params={this.props.params} metaType={value}/>
                </Tab>
              )
            }
          </Tabs>
        </div>
      );
  }
}
