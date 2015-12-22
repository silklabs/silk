/**
 * XXX: I have no idea why the original api-schema module makes flow unhappy
 * to work around this it's ignored and re-defined here.
 *
 * TODO: get rid of this once we no longer pull api-schema from its
 * own github repo from ../api-schema.
 */
declare module 'api-schema' {
  declare class ExpressRoutes {
    define(options: any, methodFn: Function): void;
  }
  declare function expressApi(routes: any, opts: any): ExpressRoutes;
}
