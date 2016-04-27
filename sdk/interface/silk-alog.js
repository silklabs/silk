/**
 * silk-alog module interface
 * @flow
 */

type SilkALogFunc = (tagOrMessage: string, maybeMessage?: string) => void;

declare module "silk-alog" {
  declare var verbose: SilkALogFunc;
  declare var debug: SilkALogFunc;
  declare var info: SilkALogFunc;
  declare var warn: SilkALogFunc;
  declare var error: SilkALogFunc;
  declare var fatal: SilkALogFunc;
}
