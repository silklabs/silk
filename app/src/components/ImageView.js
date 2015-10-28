import React from 'react-native';
let ImageView = React.requireNativeComponent('ImageView');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'imageview';

export default class extends React.Component {

  getNativeHandle() {
    return React.findNodeHandle(this.refs[RCT_NATIVE_REF]);
  }

  render() {
    let nativeProps = Object.assign({}, this.props, {
      ref: RCT_NATIVE_REF,
    });

    return (
      <ImageView {... nativeProps} />
    );
  }
}
