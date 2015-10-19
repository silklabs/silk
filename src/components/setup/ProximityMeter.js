import React from 'react-native';
let {
  StyleSheet,
  View,
} = React;

export default class ProximityMeter extends React.Component {

  static propTypes = {
    rssi: React.PropTypes.number.isRequired,
    style: View.propTypes.style,
  };

  render() {
    let { rssi } = this.props;
    return (
      <View style={[styles.container, this.props.style]}>
        <View style={[styles.closeCircle, rssi > -50 ? styles.thereColor : styles.notThereColor]} />
        <View style={[styles.nearCircle, rssi > -60 ? styles.thereColor : styles.notThereColor]} />
        <View style={[styles.farCircle, rssi > -70 ? styles.thereColor : styles.notThereColor]} />
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
