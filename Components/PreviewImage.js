import React from 'react-native';

// There are two parts to the native wrapper:
// 1.Public interface exposed for method calls:
import { PreviewImageManager } from 'NativeModules';
// 2: Component interface exposed for UI:
var PreviewImage = React.requireNativeComponent('PreviewImage');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'previewimage';

export default class extends React.Component {

  getNativeHandle() {
    return React.findNodeHandle(this.refs[RCT_NATIVE_REF]);
  }

  render() {
    let nativeProps = Object.assign({}, this.props, {
      ref: RCT_NATIVE_REF
    });

    return (
      <PreviewImage {... nativeProps} />
    );
  }
}
