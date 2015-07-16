import React from 'react-native';

// There are two parts to the native wrapper:
// 1.Public interface exposed for method calls:
import { LiveVideoManager} from 'NativeModules';
// 2: Component interface exposed for UI:
var LiveVideo = React.requireNativeComponent('LiveVideo');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'livevideo';

export default class extends React.Component {

  getNativeHandle() {
    return React.findNodeHandle(this.refs[RCT_NATIVE_REF]);
  }

  destroy() {
    return LiveVideoManager.destroy(this.getNativeHandle());
  }

  render() {
    let nativeProps = Object.assign({}, this.props, {
      ref: RCT_NATIVE_REF,
      style: {
        flex: 1
      }
    });

    return (
      <LiveVideo {... nativeProps} />
    );
  }
}
