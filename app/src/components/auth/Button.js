import React from 'react-native';
let {
  ActivityIndicatorIOS,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} = React;

export default class Button extends React.Component {
  static propTypes = {
    label: React.PropTypes.string,
    disabled: React.PropTypes.bool,
    secondary: React.PropTypes.bool,
    inProgress: React.PropTypes.bool,
    onPress: React.PropTypes.func,
  };

  render() {
    let label;
    if (this.props.inProgress) {
      label = <ActivityIndicatorIOS color="white" />;
    } else {
      label = <Text style={styles.buttonLabel}>{this.props.label}</Text>;
    }
    let noPress = this.props.disabled || this.props.inProgress;
    let buttonStyles = [styles.button];
    noPress && buttonStyles.push(styles.disabledButton);
    this.props.secondary && buttonStyles.push(styles.secondaryButton);
    let button = (
      <View style={buttonStyles}>
        {label}
      </View>
    );
    if (noPress) {
      return button;
    }
    return (
      <TouchableOpacity onPress={this.props.onPress}>
        {button}
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ff530d',
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    marginVertical: 8,
  },
  secondaryButton: {
    backgroundColor: '#99a0a4',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonLabel: {
    fontFamily: 'Open Sans',
    fontSize: 13,
    fontWeight: 'bold',
    color: 'white',
  },
});
