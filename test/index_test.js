import path from 'path';

import Builder from '../src/';

suite('compile a library', () => {
  const IMAGE = 'lightsofapollo/node-module-build:latest';

  const builder = new Builder(IMAGE);
  const packages = ['opencv', 'scrypt'];

  for (let pkg of packages) {
    test(`${pkg} build opencv`, async () => {
      let source = path.join(__dirname, `../builder/tests/node_modules/${pkg}`);
      let dest = path.join(__dirname, `../builder/tests/out/${pkg}`);

      await builder.compile(source, dest);
    });
  }

});
