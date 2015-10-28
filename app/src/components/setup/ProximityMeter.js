import React from 'react-native';
let {
  StyleSheet,
  View,
} = React;

export default class ProximityMeter extends React.Component {

  static propTypes = {
    // very far, far, near, close
    // Or IOW the number of circles we paint black.
    proximity: React.PropTypes.oneOf([0, 1, 2, 3]),
    style: View.propTypes.style,
  };

  render() {
    let { proximity } = this.props;
    return (
      <View style={[styles.container, this.props.style]}>
        <View style={[styles.closeCircle, proximity >= 3 ? styles.thereColor : styles.notThereColor]} />
        <View style={[styles.nearCircle, proximity >= 2 ? styles.thereColor : styles.notThereColor]} />
        <View style={[styles.farCircle, proximity >= 1 ? styles.thereColor : styles.notThereColor]} />
      </View>
    );
  }

}

const styles = StyleSheet.create({
  container: {
    width: 300,
    height: 300,
  },
  closeCircle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 25,
  },
  nearCircle: {
    position: 'absolute',
    left: 50,
    top: 50,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 25,
  },
  farCircle: {
    position: 'absolute',
    left: 100,
    top: 100,
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 25,
  },
  thereColor: {
    borderColor: 'black',
  },
  notThereColor: {
    borderColor: 'grey',
  },
});
