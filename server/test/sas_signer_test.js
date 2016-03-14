import assert from 'assert';

import createContext from './server/context'
import Signer from '../src/sas_signer';

suite('signer', () => {
  const context = createContext();

  test('.createTableSignatures', () => {
    const subject = new Signer(context.config.azure)
    let signatures = subject.createTableSignatures('sigservers', {
      expiration: new Date(),
      signedPermissions: 'r'
    });

    // This is just a quick sanity check real tests will exercise the api ...
    assert.ok(Array.isArray(signatures));
    for (let sig of signatures) {
      let [host, sas] = sig;
      assert.equal(sas.sp, 'r');
    }
  });
});
