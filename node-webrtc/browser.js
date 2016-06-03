const RTCIceCandidate       = window.mozRTCIceCandidate       || window.webkitRTCIceCandidate       || window.RTCIceCandidate;
const RTCPeerConnection     = window.mozRTCPeerConnection     || window.webkitRTCPeerConnection     || window.RTCPeerConnection;
const RTCSessionDescription = window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.RTCSessionDescription;

const getUserMedia = (navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia);

Object.assign(module.exports, {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  getUserMedia,
});
