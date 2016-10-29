import { sleep } from './fixtures/import';

suite('mocha', () => {
  test('stuff works?', async () => {
    await sleep();
  });
});
