/**
 * Collection of browser shims to make various JS libraries happy.
 */

// socket.io does some detection based on userAgent for ios/gecko so we assign a
// dummy string which nobody cares about.
if (!('userAgent' in navigator)) {  //eslint-disable-line
  navigator.userAgent = 'react-native';  //eslint-disable-line
}

// XXX: Hack to make debug module happy.
if (typeof GLOBAL.document === 'undefined') {
  GLOBAL.document = {
    documentElement: {
      style: {}
    }
  };
}
