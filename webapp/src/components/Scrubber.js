
import React from 'react';

export default class Scrubber extends React.Component {
  _onScrub = (e) => {
    this.props.onScrub(e.target.value);
  };

  render() {
    let style = {
      width: (this.props.width + 15) + 'px',
      paddingLeft: '15px',
    };
    return (
      <div style={style}>
        <input
          ref="due"
          type="range"
          value={this.props.pos}
          min={this.props.start}
          max={this.props.end}
          onInput={this._onScrub}
          step={0.05}
          disabled={this.props.disabled}
        />
      </div>
    );
  }
}
