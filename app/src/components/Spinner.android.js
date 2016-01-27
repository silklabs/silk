import React from 'react-native';
const { ProgressBarAndroid } = React;

const SIZE_TO_ANDROID_STYLE_ATTR = {
  small: 'Small',
  large: 'Normal',
};

export default class Spinner extends React.Component {

  static propTypes = {
    color: ProgressBarAndroid.propTypes.color,
    size: React.PropTypes.oneOf([
      'small',
      'large',
    ]),
  };

  render() {
    const {size, ...props} = this.props;
    return (
      <ProgressBarAndroid
        styleAttr={SIZE_TO_ANDROID_STYLE_ATTR[size] || 'Small'}
        indeterminate={true}
        {...props}
      />
    );
  }

}
