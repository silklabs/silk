/* @noflow */
import assert from 'assert';
import {StdoutHook} from './hook';
import makeLog from '..';

suite(`log`, () => {

  let log;

  function testDebugOutput(regexp, expectedOutput, ...args) {
    assert(regexp instanceof RegExp);

    if (!args.length) {
      args = [expectedOutput];
    }

    const hook = new StdoutHook();

    log.debug(...args);

    hook.unhook();

    const line = hook.read();
    const match = line.match(regexp);
    assert(match, `Output did not match regular expression: '${line}'`);
    assert.equal(match.length, 2, `Incorrect number of matches`);

    if (typeof expectedOutput === `object` &&
        expectedOutput instanceof RegExp) {
      assert(expectedOutput.test(match[1]), `Output did not match expected`);
    } else {
      assert.equal(match[1], expectedOutput, `Output did not match expected`);
    }
  }

  function colorRegExpTemplate(enclosed) {
    return `\\u001b\\[3\\dm${enclosed}\\u001b\\[3\\dm`;
  }

  const colorRegExp =
    /silk\-log\:debug\s\u001b\[3\dm\(\+\d+ms\)\s(.+)\u001b\[0m\n/;
  const noColorRegExp = /silk\-log\:debug\s\(\+\d+ms\)\s(.+)\n/;

  setup(() => {
    log = makeLog(`log`);
  });

  test(`single string color`, () => {
    log.debug.useColors = true;
    testDebugOutput(colorRegExp, `Hi`);
  });

  test(`single string no color`, () => {
    log.debug.useColors = false;
    testDebugOutput(noColorRegExp, `Hi`);
  });

  test(`single object color`, () => {
    log.debug.useColors = true;
    const expected = `\\{ foo\\: ` + colorRegExpTemplate(`'bar'`) + ` \\}`;
    testDebugOutput(colorRegExp, new RegExp(expected), {foo: 'bar'});
  });

  test(`single object no color`, () => {
    log.debug.useColors = false;
    testDebugOutput(noColorRegExp, `{ foo: 'bar' }`, {foo: 'bar'});
  });

  test(`single printf color`, () => {
    log.debug.useColors = true;
    testDebugOutput(colorRegExp, `Hi(10)`, `Hi(%d)`, 10);
  });

  test(`single printf no color`, () => {
    log.debug.useColors = false;
    testDebugOutput(noColorRegExp, `Hi(10)`, `Hi(%d)`, 10);
  });

  test(`multiple printf color`, () => {
    log.debug.useColors = true;
    testDebugOutput(colorRegExp, `Hi(10, foo)`, `Hi(%d, %s)`, 10, `foo`);
  });

  test(`multiple printf no color`, () => {
    log.debug.useColors = false;
    testDebugOutput(noColorRegExp, `Hi(10, foo)`, `Hi(%d, %s)`, 10, `foo`);
  });

  test(`single printf object color`, () => {
    log.debug.useColors = true;
    const expected =
      `Hi\\(\\{ foo\\: ` + colorRegExpTemplate(`'bar'`) + ` \\}\\)`;
    testDebugOutput(colorRegExp, new RegExp(expected), `Hi(%o)`, {foo: 'bar'});
  });

  test(`single printf object no color`, () => {
    log.debug.useColors = false;
    testDebugOutput(noColorRegExp,
      `Hi({ foo: 'bar' })`,
      `Hi(%o)`,
      {foo: 'bar'});
  });

  test(`multiple printf object color`, () => {
    log.debug.useColors = true;
    const expected =
      `Hi\\(\\{ foo\\: ` + colorRegExpTemplate(`'bar'`) + ` \\}, ` +
      `\\{ bar\\: ` + colorRegExpTemplate(`10`) + ` \\}\\)`;
    testDebugOutput(colorRegExp,
      new RegExp(expected),
      `Hi(%o, %o)`,
      {foo: 'bar'},
      {bar: 10});
  });

  test(`multiple printf object no color`, () => {
    log.debug.useColors = false;
    testDebugOutput(noColorRegExp,
      `Hi({ foo: 'bar' }, { bar: 10 })`,
      `Hi(%o, %o)`,
      {foo: 'bar'},
      {bar: 10});
  });

});
