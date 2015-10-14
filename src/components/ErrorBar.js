import React from 'react-native';
let {
  View,
  StyleSheet,
  Text,
} = React;

export default class extends React.Component {

  static propTypes = {
    heading: React.PropTypes.string.required,
    descripton: React.PropTypes.string.required,
  };

  render() {
    return (
      <View style={styles.warningBox}>
        <Text style={styles.heading}>{this.props.heading}</Text>
        <Text style={styles.description}>{this.props.description}</Text>
      </View>
    );
  }

}

const styles = StyleSheet.create({
  warningBox: {
    backgroundColor: '#c30016',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  heading: {
    fontSize: 17,
    fontWeight: '500',
    color: 'white',
  },
  description: {
    color: 'white',
    marginTop: 2,
  },
});
