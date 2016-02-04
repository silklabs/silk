'use strict';

module.exports.install = {
  help: `Install fake applications`,
  main: (args) => {
    console.log('.... Done!');
  },
};


module.exports.listModules = {
  name: 'list-modules',
  help: 'List fake modules...',
  main: function (args) {
    console.log('one');
    console.log('two');
    console.log('three');
  },
};

module.exports.publish = {
  help: `Publish fake applications to the interwebs`,
  arguments: [
    [['--fast'], {
      action: 'storeTrue',
      help: 'Disable checks',
    }],
  ],
  main: (context, args) => {
    console.log('Starting to publish...', args.fast ? 'without checks' : '');
    setTimeout(() => {
      console.log('.... Done!');
    }, 500);
  },
};

