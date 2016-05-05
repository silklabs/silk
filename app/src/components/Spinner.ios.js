import React from 'react';
import { ActivityIndicatorIOS } from 'react-native';

export default class Spinner extends React.Component {

  static propTypes = {
    color: ActivityIndicatorIOS.propTypes.color,
    size: ActivityIndicatorIOS.propTypes.size,
  };

  render() {
    return <ActivityIndicatorIOS {...this.props} />;
  }

}
