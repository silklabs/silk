// XXX: Hack to enable android log formatting for tests.
process.env.SILK_ANDROID_LOGS = 1;

const preset = require('../../babel-preset-silk-node4');

require('../../babel-register')({
  presets: [preset]
});
