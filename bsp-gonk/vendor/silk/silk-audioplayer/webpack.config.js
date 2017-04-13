/* eslint-disable flowtype/require-valid-file-annotation */
const CopyWebpack = require('copy-webpack-plugin');

if (process.env.NODE_ENV === 'production') {
  module.exports = {
    entry: {
      'lib/index.js': './lib/index.js',
    },
  };
} else {
  // Only install tools in development builds
  module.exports = {
    entry: {
      'lib/index.js': './lib/index.js',
      'tools/play_audiofile.js': './tools/play_audiofile.js',
      'tools/play_filestream.js': './tools/play_filestream.js',
      'tools/play_shoutcast.js': './tools/play_shoutcast.js',
      'tools/play_progressive.js': './tools/play_progressive.js',
    },
    plugins: [
      new CopyWebpack([
        {from: 'media', to: 'media'},
      ]),
    ],
  };
}
