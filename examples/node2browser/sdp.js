const fs = require('fs');
const sdpTransform = require('sdp-transform');

module.exports = function(sdpStr) {
  console.log(sdpStr);

  const out = sdpStr.replace(
    'm=video 9 UDP/TLS/RTP/SAVPF 100 101 107 116 117 96 97 99 98',
    'm=video 9 UDP/TLS/RTP/SAVPF 100 101 107 116 117 96 97 99 98'
  );

  console.log(out);
  return out;
}
