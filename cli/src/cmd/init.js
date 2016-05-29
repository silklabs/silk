/**
 * Implements a relatively simple init subcommand (similar to npm init).
 *
 * @flow
 */
import invariant from 'assert';
import path from 'path';
import * as childProcess from 'child_process';

import * as prompt from 'prompt';
import mkdirp from 'mkdirp-promise';
import fs from 'mz/fs';

const INIT_TEMPLATES = path.join(__dirname, '../../templates/init/');

function ask(input) {
  return new Promise((accept, reject) => {
    prompt.get(input, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      accept(result);
    });
  });
}

export let init = {
  help: `
    Initialize a new project directory for your Silk application
  `,
  arguments: [
    [['destination'], {
      help: 'Where to create project',
      type: path.resolve,
    }],
  ],

  main: async (argv: Object): Promise<void> => {
    if (!await fs.exists(argv.destination)) {
      await mkdirp(argv.destination);
    }

    let pkgPath = path.join(argv.destination, 'package.json');
    let pkg = {};
    if (await fs.exists(pkgPath)) {
      let content;
      try {
        content = await fs.readFile(pkgPath, 'utf8');
      } catch (err) {
        console.error(`Failed to read: ${pkgPath} error: ${err.stack}`);
        process.exit(1);
      }

      invariant(content);
      try {
        pkg = JSON.parse(content);
      } catch (err) {
        console.error(`Failed to parse: ${pkgPath} error: ${err.stack}`);
        process.exit(1);
      }
    }

    // TODO: Add more stuff in this...
    if (!pkg.silk) {
      pkg.silk = {};
    }

    prompt.start();

    let indexPath = path.join(argv.destination, 'index.js');
    let deviceFilePath = path.join(argv.destination, 'device.js');
    let questions: {
      properties: {[key: string]: Object}
    } = {
      // XXX: If this is trying to replace npm init then we should add all the
      // same stuff it does...
      properties: {
        name: {
          message: 'Package name',
          default: pkg.name || path.basename(argv.destination),
          required: true,
        },
      },
    };

    if (await fs.exists(indexPath)) {
      questions.properties.overrideIndex = {
        message: 'Override index.js ?',
        validator: /y[es]*|n[o]?/,
        warning: 'Must respond yes or no',
        default: 'no',
      };
    }

    let result;
    try {
      result = await ask(questions);
    } catch (err) {
      // If we get the SIGINT here abort with slightly nicer error...
      if (err.message === 'canceled') {
        console.log('\n\n...Aborted init');
        process.exit(1);
      }
      throw err;
    }

    if (!result.overrideIndex || result.overrideIndex[0] === 'y') {
      let indexFile = await fs.readFile(path.join(INIT_TEMPLATES, 'index.js'));
      let deviceFile = await fs.readFile(path.join(INIT_TEMPLATES, 'device.js'));
      await fs.writeFile(indexPath, indexFile);
      await fs.writeFile(deviceFilePath, deviceFile);
    }

    pkg.name = result.name;

    if (!pkg.dependencies) {
      pkg.dependencies = {};
    }

    if (!pkg.dependencies.silk) {
      pkg.dependencies.silk = '>=0.13.0 <1.0.0';
    }

    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    let rcPath = path.join(argv.destination, '.silkrc');
    await fs.writeFile(rcPath, JSON.stringify({
      plugins: [
        'silk/cli',
      ],
    }, null, 2));

    console.log('Running: npm install silk...');
    let npmResult = childProcess.spawnSync(
      'npm', [ 'install', 'silk' ],
      {
        cwd: argv.destination,
        stdio: 'inherit',
      }
    );
    if (npmResult.error || npmResult.status !== 0) {
      console.log('\n\n...npm install failed with:',
        npmResult.error || `error: ${npmResult.status}`);
      process.exit(1);
    }
  },
};
