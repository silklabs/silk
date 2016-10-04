/**
 * @flow
 */

import assert from 'assert';
import {pbkdf2} from '..';

suite('PBKDF2 tests', () => {
  test('old Silk dev account test vector', async () => {
    const password = 'silklabs';
    const salt = 'engineering@silklabs.com';
    const rounds = 64000;
    const key = await pbkdf2.genKeyDerivationHex(password, salt, rounds);
    assert.equal(key, 'fed892d4c48cb16af5f1fb33754a81be59809518046a7990208c6a61e4b731b8');
  });
});
