import React from 'react-native';

let {
  View,
  Text,
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
      borderColor: stroke
    };

    return (
      <View style={style} />
    );
  }
});

let ObjectBoxes = React.createClass({
  propTypes: {
    style: React.PropTypes.object,
    width: React.PropTypes.number.isRequired,
    height: React.PropTypes.number.isRequired,
    objects: React.PropTypes.array.isRequired,
    objectColor: React.PropTypes.string
  },

  getDefaultProps: function() {
    return {
      objectColor: '#ADD8E6'
    };
  },

  objectBox(idx, tag, rect, ratio) {
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
      textAlign: 'left'
    };

    let objectContainerStyle = {
      position: 'absolute',
    };

    return (
      <View style={objectContainerStyle} key={idx}>
        <Square top={top} left={left} width={width} height={height} stroke={this.props.objectColor}/>
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

      for (let j = 0; j < rects.length; ++j) {
        boxes.push(this.objectBox(count, tag, rects[j], ratio));
        count++;
      }
    }

    return (
      <View pointerEvents="none" style={this.props.style}>
        {boxes}
      </View>
    );
  }
});

export default ObjectBoxes;
