/**
 * @flow
 *
 * Adds missing functionality to the default "net" interface flow exports.
 */

declare module "net" {
  declare class Socket extends net$Socket {}
  declare function createConnection(
    pathOrHost: string|number,
    handler: () => void,
  ): Socket;
}
