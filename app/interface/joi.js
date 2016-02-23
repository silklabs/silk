/* @flow */

declare module 'joi' {
  // This is pretty lame, but good enough for now to get Flow to pass.
  declare var array: any;
  declare var boolean: any;
  declare var number: any;
  declare var object: any;
  declare var string: any;
  declare var validate: (
    data: any,
    schema: any,
    callback: (error: Error, value: any) => void
  ) => void;
}
