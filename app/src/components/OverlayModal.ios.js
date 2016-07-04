import React from 'react';
import {
  NativeModules,
  Dimensions,
  StyleSheet,
  findNodeHandle,
  requireNativeComponent,
} from 'react-native';

// There are two parts to the native wrapper:
// 1.Public interface exposed for method calls:
const { OverlayModalManager } = NativeModules;
// 2: Component interface exposed for UI:
const OverlayModal = requireNativeComponent('OverlayModal');

// Reference to the native component we are wrapping.
const RCT_NATIVE_REF = 'overlaymodal';

export function getLandscapeDimensions() {
  let deviceWidth = Dimensions.get('window').width;
  let deviceHeight = Dimensions.get('window').height;
  let dimensions = {};

  // Because the overlay modal is not an actual subview of the react root view
  // we must manually assign a height and width. For now we always render in
  // landscape so figure out what that means in height/width regardless of
  // the current orientation of the device.
  if (deviceWidth > deviceHeight) {
    // currently in landscape:
    dimensions.height = deviceHeight;
    dimensions.width = deviceWidth;
  } else {
    // currently in portrait (flip the values):
    dimensions.width = deviceHeight;
    dimensions.height = deviceWidth;
  }

  return dimensions;
}

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
    };
  },

  getNativeHandle() {
    return findNodeHandle(this.refs[RCT_NATIVE_REF]);
  },

  show() {
    return new Promise((accept, reject) => {
      if (this._showing) {
        accept();
        return;
      }

      this._showing = true;
      this.props.onShowStart && this.props.onShowStart();
      // XXX: Use promises after react-native 0.7.1 upgrade
      OverlayModalManager.show(this.getNativeHandle(), () => {
        // Signal animation end (the view is still showing)
        this.props.onShowEnd && this.props.onShowEnd();
        accept();
      });
    });
  },

  dismiss() {
    return new Promise((accept, reject) => {
      if (!this._showing || this._dismissing) {
        accept();
        return;
      }

      this._dismissing = true;
      this.props.onDismissStart && this.props.onDismissStart();
      OverlayModalManager.dismiss(this.getNativeHandle(), () => {
        // Animation has ended mark the view as hidden now...
        this._showing = false;
        this._dismissing = false;
        this.props.onDismissEnd && this.props.onDismissEnd();
        accept();
      });
    });
  },

  getDefaultProps() {
    return {
      orientation: 'landscape',
      presented: false,
    };
  },

  componentDidUpdate(prevProps) {
    // When the "presented" value changes we hide/show the underlying
    // controller.
    if (prevProps.presented === this.props.presented) {
      return;
    }
    if (this.props.presented) {
      this.show();
    } else {
      this.dismiss();
    }
  },

  componentDidMount() {
    // This method is invoked when the view is mounted so this handles the case
    // where the view is shown by default...
    if (this.props.presented) {
      this.show();
    }
  },

  render() {
    // If we are not presenting anything don't render contents...
    if (!this.props.presented) {
      return <React.View />;
    }

    return (
      <OverlayModal
        style={[styles.modal, getLandscapeDimensions()]}
        ref={RCT_NATIVE_REF}
        orientation={this.props.orientation}>
        {this.props.children}
      </OverlayModal>
    );
  },
});

const styles = StyleSheet.create({
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'stretch',
  },
});
