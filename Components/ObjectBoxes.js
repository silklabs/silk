import React from 'react-native';
import ReactART from 'ReactNativeART';
import Rectangle from './Rectangle';

let {
  Surface,
  Group,
  Text,
} = ReactART;

var FIELD_WIDTH = 320;
var FIELD_HEIGHT = 180;

let ObjectBoxes = React.createClass({
  propTypes: {
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
    let x = Math.ceil(rect.x * ratio);
    let y = Math.ceil(rect.y * ratio);
    let width = Math.ceil(rect.width * ratio);
    let height = Math.ceil(rect.height * ratio);

    return (
      <Group x={x} y={y} key={idx}>
        <Rectangle
          stroke={this.props.objectColor}
          height={height}
          width={width} />
        <Text
         x={0}
         y={height}
         alignment='middle'
         fill='#000'
         font='10px "AppleSDGothicNeo-SemiBold"'>{tag}
        </Text>
      </Group>
    )
  },

  render() {
    let { objects, width, height } = this.props;

    // We need to scale the dimensions correctly to the scale of the device.
    let xRatio = width / FIELD_WIDTH;
    let yRatio = height / FIELD_HEIGHT;

    let ratio = Math.min(xRatio, yRatio);

    let groups = [];
    let count = 0;
    for (let i = 0; i < objects.length; ++i) {
      var tag = objects[i].tag;
      var rects = objects[i].rects;

      for (let j = 0; j < rects.length; ++j) {
        groups.push(this.objectBox(count, tag, rects[j], ratio));
        count++;
      }
     }

    return (
      <Surface
        width={width}
        height={height}>
        {groups}
      </Surface>
    );
  }
});

export default ObjectBoxes;
