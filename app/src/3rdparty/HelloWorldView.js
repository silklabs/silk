import React from 'react';
import { View, requireNativeComponent } from 'react-native';

const HelloWorldView = requireNativeComponent('TPYHelloWorldReactView', {
  name: 'HelloWorldView',
  propTypes: {
    ...View.propTypes,
    onButtonPress: React.PropTypes.func,
  },
});
export default HelloWorldView;
