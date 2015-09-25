import React from 'react-native';

let {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} = React;

let Square = React.createClass({
  render: function() {
    let {top, left, width, height, stroke} = this.props;

    let style = {
      position: 'absolute',
      top: top,
      left: left,
      width: width,
      height: height,
      borderWidth: 2,
      borderColor: stroke,
    };

    return (
      <View style={style} />
    );
  }
});

let ObjectBoxes = React.createClass({
  propTypes: {
    id: React.PropTypes.string.isRequired,
    socket: React.PropTypes.object.isRequired,
    style: React.PropTypes.object,
    width: React.PropTypes.number.isRequired,
    height: React.PropTypes.number.isRequired,
    objects: React.PropTypes.array.isRequired,
    objectColor: React.PropTypes.string,
  },

  getDefaultProps: function() {
    return {
      objectColor: '#ADD8E6'
    };
  },

  /**
   * For selected tags report the object to the device as being incorrect
   */
  _reportObject: function(tag, when) {
    if ((tag === 'face') || (tag === 'car')) {
      let { socket, id} = this.props;
      let msg = {msgTarget: 'extensions', targetName: 'detectobject', msg: 'reportobject', id, tag, when};
      console.log('Reporting object:' + tag + ' when: ' + when);
      socket.emit('cmd', msg);
    }
  },

  objectBox(idx, tag, when, rect, ratio) {
    let left = Math.ceil(rect.x * ratio);
    let top = Math.ceil(rect.y * ratio);
    let width = Math.ceil(rect.width * ratio);
    let height = Math.ceil(rect.height * ratio);

    let objectLabelStyle = {
      position: 'absolute',
      top: (top + height),
      left: left,
      fontFamily: 'Open Sans',
      color: 'black',
      fontSize: 10,
      textAlign: 'left',
    };

    let objectClick = this._reportObject.bind(this, tag, when);

    return (
      <View style={styles.objectContainerStyle} key={idx}>
        <TouchableOpacity onPress={objectClick}>
        <Square top={top} left={left} width={width} height={height} stroke={this.props.objectColor} />
        </TouchableOpacity>
        <Text style={objectLabelStyle}>
          {tag}
        </Text>
      </View>
    );
  },

  render() {
    let { objects, width, height, previewSize } = this.props;

    // We need to scale the dimensions correctly to the scale of the device.
    let xRatio = width / previewSize.width;
    let yRatio = height / previewSize.height;

    let ratio = Math.min(xRatio, yRatio);

    let boxes = [];
    let count = 0;
    for (let i = 0; i < objects.length; ++i) {
      let tag = objects[i].tag;
      let rects = objects[i].rects;
      let when = objects[i].when;

      for (let j = 0; j < rects.length; ++j) {
        boxes.push(this.objectBox(count, tag, when, rects[j], ratio));
        count++;
      }
    }

    return (
      <View style={this.props.style}>
        {boxes}
      </View>
    );
  }
});

var styles = StyleSheet.create({
  objectContainerStyle: {
    position: 'absolute',
  },
});

export default ObjectBoxes;
