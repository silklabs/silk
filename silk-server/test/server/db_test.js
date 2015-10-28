import assert from 'assert';
import createDb from '../../src/server/db';
import createContext from './context';

suite('db', () => {
  let context = createContext();

  test('connections', async () => {
    let db = await createDb(context.config);
    let xfoo = db.collection('xfoo');
    await xfoo.insert({ xfoo: 'foobar' });
    let all = await xfoo.find().toArray();
    assert.equal(all.length, 1);
    await xfoo.drop();
    let allAfterDrop = await xfoo.find().toArray();
    assert.equal(allAfterDrop.length, 0);
  });

});
