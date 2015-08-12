import React from 'react-native';
import { SystemButtonManager } from 'NativeModules';
import StyleSheetRegistry from 'StyleSheetRegistry';

//let { StyleSheetRegistry } = React;

let SystemButtonNative = React.requireNativeComponent('SystemButton');
let SystemButton = React.createClass({
  propTypes: {
    // Configuration
    type: React.PropTypes.string,
    onPress: React.PropTypes.func,
    color: React.PropTypes.string,
  },

  onSystemButtonPress() {
    this.props.onPress && this.props.onPress();
  },

  getStyleProperty(objectOrID, property) {
    if (!objectOrID) {
      return;
    }

    if (typeof objectOrID === 'number') {
      objectOrID = StyleSheetRegistry.getStyleByID(objectOrID);
    }

    return objectOrID[property];
  },

  render() {
    // Get props (without mutating this.props).
    let nativeProps = Object.assign(
      {},
      this.props,
      { onSystemButtonPress: this.onSystemButtonPress }
    );

    // Extract the color value from styles and set it directly in native.
    let styleColor = this.getStyleProperty(nativeProps.style, 'color');
    if (styleColor) {
      nativeProps.color = nativeProps.style.color;
    }

    return (
      <SystemButtonNative {... nativeProps} />
    );
  }
});


// Re-export constants...
for (var key in SystemButtonManager) {
  SystemButton[key] = SystemButtonManager[key]
}

export default SystemButton;
