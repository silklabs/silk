import React from 'react-native';
const { ActivityIndicatorIOS } = React;

export default class Spinner extends React.Component {

  static propTypes = {
    color: ActivityIndicatorIOS.propTypes.color,
    size: ActivityIndicatorIOS.propTypes.size,
  };

  render() {
    return <ActivityIndicatorIOS {...this.props} />;
  }

}
