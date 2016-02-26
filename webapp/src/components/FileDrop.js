import React from 'react';

export default class FileDrop extends React.Component {
  entered = new Set();

  componentDidMount() {
    document.ondragenter = this._onDragEnter;
    document.ondragover = this._onDragOver;
    document.ondragleave = this._onDragLeave;
    document.ondrop = this._onDrop;
  }

  componentWillUnmount() {
    [ 'dragenter', 'dragover', 'dragleave', 'drop' ].forEach((event) => {
      delete document[`on${event}`];
    });
  }

  _onDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.entered.add(e.target);
    if (this.entered.size === 1) {
      this.props.onStart(e);
    }
  };

  _onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  _onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.entered.delete(e.target);
    if (this.entered.size === 0) {
      this.props.onCancel(e);
    }
  };

  _onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer || !e.dataTransfer.files.length) {
      return this.props.onCancel();
    }
    let file = e.dataTransfer.files[0];
    let reader = new FileReader();
    reader.onload = (e) => this.props.onDrop([ e.target.result ]);
    return reader.readAsArrayBuffer(file);
  };

  render() {
    return null;
  }
}
