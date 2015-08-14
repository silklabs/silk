import React from 'react-native'
import moment from 'moment';

let {
  Animated,
  StyleSheet,
  Text,
  View,
} = React;

export default class extends React.Component {

  static defaultProps = {
    fadeDuration: 1500,
    onDone: () => {}
  }

  static propTypes = {
    date: React.PropTypes.instanceOf(Date).isRequired,
    style: React.PropTypes.object,
    fadeDuration: React.PropTypes.number,
    onDone: React.PropTypes.func
  }

  constructor() {
    super()
    this.state = {
      opacity: new Animated.Value(1)
    }
  }

  componentDidMount() {
    Animated.timing(this.state.opacity, {
      toValue: 0,
      duration: this.props.fadeDuration
    }).start(this.props.onDone);
  }

  render() {

    let formatted = moment(this.props.date).format(
      'MMMM Do YYYY, h:mm:ss a'
    );

    return (
      <Animated.View
        style={
          [
            this.props.style,
            {
              opacity: this.state.opacity
            }
          ]
        }>

        <Text style={styles.text}>{formatted}</Text>

      </Animated.View>
    )
  }

};

var styles = StyleSheet.create({
  text: {
    opacity: 0.8,
    textAlign: 'center',
    fontSize: 14
  }
});
