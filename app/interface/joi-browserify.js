/* @flow */

declare module 'joi-browserify' {
  // This is pretty lame, but good enough for now to get Flow to pass.
  declare var object: any;
  declare var string: any;
  declare var validate: (
    data: any,
    schema: any,
    callback: (error: Error, value: any) => void
  ) => void;
}
