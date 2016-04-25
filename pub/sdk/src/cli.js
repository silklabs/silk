import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';

function findPackageRoot() {
  let curPath = process.cwd();
  let curName = path.join(curPath, 'package.json');

  while (!fs.existsSync(curName)) {
    if (curPath === '/') {
      throw new Error(`Could not locate 'package.json' file. Ensure you're running this command inside a Silk extension project.`);
    }
    curPath = path.dirname(curPath);
    curName = path.join(curPath, 'package.json');
  }

  return curPath;
}

function getPackageName() {
  let packageFile = path.join(findPackageRoot(), 'package.json');
  return require(packageFile).name;
}


export let run = {

  help: 'Run the extension on device.',
  main: async (args) => {
    console.log(`Running ${getPackageName()} on device...`);
    // TODO
  }

};

export let stop = {

  help: 'Stop running the extension device.',
  main: async (args) => {
    console.log(`Stopping ${getPackageName()}...`);
    // TODO
  }

};

export let log = {

  help: 'Show log output from the extension',
  main: async (args) => {
    console.log(`Showing log output for ${getPackageName()}...`);
    childProcess.spawn(
      'adb',
      ['logcat', '-s', getPackageName()],
      {stdio: 'inherit'}
    );
  }

};
