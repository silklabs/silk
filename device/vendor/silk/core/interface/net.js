/**
 * @flow
 *
 * Adds missing functionality to the default "net" interface flow exports.
 */

declare module "net" {
  declare function createConnection(
    pathOrHost: string|number,
    handler: () => void,
  ): net$Socket;
}
