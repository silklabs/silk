import React from 'react-native';
import ReactART from 'ReactNativeART';
import Rectangle from './Rectangle';

let {
  Surface,
  Group
} = ReactART;

let FaceBoxes = React.createClass({
  propTypes: {
    width: React.PropTypes.number.isRequired,
    height: React.PropTypes.number.isRequired,
    faces: React.PropTypes.array.isRequired,
    faceColor: React.PropTypes.string
  },

  getDefaultProps: function() {
    return {
      faceColor: '#ADD8E6'
    };
  },

  faceGroup(idx, face, ratio) {
    let x = Math.ceil(face.x * ratio);
    let y = Math.ceil(face.y * ratio);
    let width = Math.ceil(face.width * ratio);
    let height = Math.ceil(face.height * ratio);
    return (
      <Group x={x} y={y} key={idx}>
        <Rectangle
          stroke={this.props.faceColor}
          height={height}
          width={width} />
      </Group>
    )
  },

  render() {
    let { faces, width, height } = this.props;
    let firstFace = faces[0];

    // We need to scale the dimensions correctly to the scale of the device.
    let xRatio = width / firstFace.fieldWidth;
    let yRatio = height / firstFace.fieldHeight;

    let ratio = Math.min(xRatio, yRatio);
    let groups = this.props.faces.map((face, idx) => {
      return this.faceGroup(idx, face, ratio);
    });

    return (
      <Surface
        width={width}
        height={height}>
        {groups}
      </Surface>
    );
  }
});

export default FaceBoxes;
