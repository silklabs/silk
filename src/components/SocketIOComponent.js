import React from 'react-native';

export default class SocketIOComponent extends React.Component {

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.socket !== this.props.socket) {
      if (prevProps.socket) {
        // In case we were still waiting for the old socket to
        // connect, unsubscribe ourselves from it.
        prevProps.socket.off('connect', this._subscribeToSocket);
        this.unsubscribeFromSocket(prevProps.socket);
      }
      this._subscribeToSocket();
    }
  }

  _subscribeToSocket = () => {
    let { socket } = this.props;
    if (!socket) {
      return;
    }

    if (!socket.connected) {
      socket.on('connect', this._subscribeToSocket);
      return;
    }

    this.subscribeToSocket(socket);
  };

  subscribeToSocket(socket) {
    throw new Error('Implement me!');
  }

  unsubscribeFromSocket(socket) {
    throw new Error('Implement me!');
  }

}
