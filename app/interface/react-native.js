/**
 * For some reason we can't just let Flow look at node_modules/react-native.
 * It spews hundreds of errors related to module imports, likely due to Haste
 * vs. node modules. So we tell Flow to ignore node_modules/react-native and
 * perform a minimal interface declaration here.
 *
 * One advantage is that we don't pull in any Flow errors that might be
 * lingering in React Native. Obvious Flow bugs in React Native are unlikely
 * given CI tests, but a mismatch in version and thus supported features
 * might still occur.
 *
 * The huge disadvantage is, of course, that we're missing out on "free" type
 * inference and declarations from upstream. We certainly don't want to
 * redeclare the entire React Native API surface here, and 'any' is not a
 * suitable final solution. So this should be seen as a temporary hack at best.
 *
 * @flow
 */

declare module 'react-native' {
  // This is pretty lame, but good enough for now to get Flow to pass.
  declare var DeviceEventEmitter: any;
  declare var NativeModules: any;
}
