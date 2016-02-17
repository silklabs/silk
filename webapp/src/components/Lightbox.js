import React from 'react';

const style = {
  position: 'absolute',
  left: '0',
  top: '0',
  width: '100%',
  height: '100%',
  backgroundColor: 'black',
  opacity: 0.6,
  zIndex: 100000,
  pointerEvents: 'none',
};

export default class Lightbox extends React.Component {
  render() {
    if (!this.props.visible) {
      return null;
    }
    return (<div style={style} />);
  }
}
