/**
 * XXX: I have no idea why the original api-schema module makes flow unhappy
 * to work around this it's ignored and re-defined here.
 */
declare module 'api-schema' {
  declare function expressApi(routes: any, opts: any): any;
}
