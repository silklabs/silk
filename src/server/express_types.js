/* @flow */

/**
 * This file contains various express types...
 *
 * Rather then use the interface/* folder we use this file explicitly for the
 * various types that are implied but not part of any module (like middleware)
 */

export type RouteNextFn = (err: ?Error) => void;
export type MiddlewareFn = (req: any, res: any, next: RouteNextFn) => void;
