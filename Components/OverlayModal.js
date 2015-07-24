import React from 'react-native';
import { getLandscapeDimensions } from '../Libraries/DeviceConfig';

// There are two parts to the native wrapper:
// 1.Public interface exposed for method calls:
import { OverlayModalManager } from 'NativeModules';
// 2: Component interface exposed for UI:
var OverlayModal = React.requireNativeComponent('OverlayModal');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'overlaymodal';

export default React.createClass({
  propTypes: {
    // Configuration
    presented: React.PropTypes.bool,
    orientation: React.PropTypes.string,

    // Events
    onShowStart: React.PropTypes.func,
    onShowEnd: React.PropTypes.func,
    onDismissStart: React.PropTypes.func,
    onDismissEnd: React.PropTypes.func,
  },

  getInitialProps() {
    return {
      presented: false,
      orientation: 'landscape',
      onShowStart: function() {},
      onShowEnd: function() {},
      onDismissStart: function() {},
      onDismissEnd: function() {},
    }
  },

  getNativeHandle() {
    return React.findNodeHandle(this.refs[RCT_NATIVE_REF]);
  },

  show() {
    return new Promise((accept, reject) => {
      if (this._showing) {
        accept()
        return;
      }

      this._showing = true;
      this.props.onShowStart && this.props.onShowStart();
      // XXX: Use promises after react-native 0.7.1 upgrade
      return OverlayModalManager.show(this.getNativeHandle(), () => {
        // Signal animation end (the view is still showing)
        this.props.onShowEnd && this.props.onShowEnd();
        accept()
      });
    })
  },

  dismiss() {
    return new Promise((accept, reject) => {
      if (!this._showing) {
        accept();
        return
      }

      this.props.onDismissStart && this.props.onDismissStart();
      return OverlayModalManager.dismiss(this.getNativeHandle(), () => {
        // Animation has ended mark the view as hidden now...
        this.props.onDismissEnd && this.props.onDismissEnd();
        this._showing = false;
        accept();
      });
    });
  },

  getDefaultProps() {
    return {
      orientation: 'landscape',
      presented: false
    }
  },

  componentDidUpdate() {
    // When the "presented" value changes we hide/show the underlying
    // controller.
    if (this.props.presented) {
      this.show();
    } else {
      this.dismiss();
    }
  },

  componentDidMount() {
    // This method is invoked when the view  is mounted so this handles the case
    // where the view is shown by default...
    if (this.props.presented) {
      this.show();
    }
  },

  render() {
    // If we are not presenting anything don't render contents...
    if (!this.props.presented) {
      return <React.View />
    }

    let style = {
      position: 'absolute',
      alignItems: 'stretch',
      flex: 1,
    };

    let dimensions = getLandscapeDimensions();
    style.height = dimensions.height;
    style.width = dimensions.width ;

    return (
      <OverlayModal
        style={style}
        ref={RCT_NATIVE_REF}
        orientation={this.props.orientation}>
        {React.Children.map(this.props.children, React.addons.cloneWithProps)}
      </OverlayModal>
    )
  }
});
