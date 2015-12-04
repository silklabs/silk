/* @flow */
type TestFn = () => void | Promise<any>

declare function test(name: string, fn:TestFn): void;
declare function setup(fn:TestFn): void;
declare function suiteSetup(fn:TestFn): void;
declare function teardown(fn:TestFn): void;
declare function suiteTeardown(fn:TestFn): void;
declare function suite(name: string, fn:() => void): void;
