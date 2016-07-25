import os from 'os';

function getPrebuilt() {
  try {
    const platform = `${os.platform()}-${os.arch()}`;
    return require(`../build-${platform}/Release/node-webrtc.node`);
  } catch (err) {
    console.error(`Failed to load prebuilt: ${err.stack}`);
    return require('../build/Release/node-webrtc.node');
  }
}

module.exports = getPrebuilt();
