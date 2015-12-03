/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

import React from 'react';

import Api from '../libraries/Api';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function timeString(stampMs) {
  return new Date(stampMs).toLocaleTimeString();
}

export default class VideoChunks extends React.Component {
  state = {
    queryTime: null,
    mostRecentTime: null,
    gaps: [],
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
    console.log('Querying 1000 chunks at', this.state.queryTime);
    Api.metadata.findAllBeforeTime({
      deviceId: this.deviceId,
      time: this.state.queryTime,
      metaType: 'video',
      maxCount: 1000,
    }).then(chunks => {
      let gaps = this.state.gaps;
      let lastTime = this.state.queryTime;
      for (let chunk of chunks) {
        let gap = lastTime - chunk.endUTC;
        if (gap > 1000) {
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
        console.log('DONE, examined all chunks in time range');
      }
    }).catch(err => console.error('Failed to fetch video chunks', err));
  }

  render() {
    let gaps = this.state.gaps.map(gap => {
      let gapSecs = (gap.end - gap.start) / 1000.0;
      return (
        <li>
          {gapSecs.toFixed(1)} secs ({(gapSecs / 60).toFixed(1)} mins):&nbsp;
          {timeString(gap.start)} - {timeString(gap.end)}
        </li>
      );
    });
    return (
      <div>
        Querying 12 hours of chunks from&nbsp;
        {timeString(this.state.queryTime)} to&nbsp;
        {timeString(this.state.mostRecentTime)}.<br />
        Gaps:
        <ol>{gaps}</ol>
      </div>
    );
  }
}
