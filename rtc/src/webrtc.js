/* eslint-disable silk/flow */
// Provide package-wide import hook for WebRTC. On device, we use
// node-webrtc. In the webapp, we use node-webrtc's 'browser' field
// which means it will be transformed to simply re-export browser
// globals. The React Native app uses webpack module aliases to
// rewrite the import to refer to react-native-webrtc.
module.exports = require('node-webrtc');
