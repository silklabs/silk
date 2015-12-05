/* @flow */
import assert from 'assert';
import Scopes from '../../src/server/scopes';
import type {Record as AccountRecord} from '../../src/server/models/accounts';

suite('scopes', function() {

  // Simple helper to generate soemthing that sorta looks like an account.
  function account(email: string): AccountRecord {
    return {
      email,
      _id: ''
    };
  }

  let subject;
  setup(async () => {
    subject = new Scopes({
      admin: ['@silklabs.com', '@silk.io'],
      root: ['james@silklabs.com']
    });
  });

  // Good to note that we are not testing that the given emails are sane only
  // that our mapping logic works vaugely right.
  [
    {
      email: 'james@silklabs.com',
      scopes: ['admin', 'root']
    },
    {
      email: 'jAmeS@silklabS.COM',
      scopes: ['admin', 'root']
    },
    {
      email: 'i.like.dots@silklabs.com',
      scopes: ['admin']
    },
    {
      email: 'james@silk.io',
      scopes: ['admin']
    },
    {
      email: 'user@exmaple.com',
      scopes: []
    }
  ].forEach((expect) => {
    let {email, scopes} = expect;
    test(`${email} should have scopes ${scopes.join(', ')}`, () => {
      assert.deepEqual(
        subject.accountScopes(account(email)),
        scopes
      );
    });
  });


});
