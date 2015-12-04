/**
 * @providesModule node-fetch
 * @flow
 */

import type {Readable} from 'stream';
export type Config = {
  method?: string;
  headers?: {[key: string]: string};
  compress?: bool;
  body?: Buffer|string|Readable;
  agent?: Object; // XXX: Add better types when agent is added to flow.
  size?: number;
}

declare export class Headers {
  get(name: string): ?string;
  set(name: string, value: string): void;
}

declare export class Response {
  url: string;
  status: string;
  statusText: string;
  headers: Headers;
  ok: bool;

  json(): Promise<Object>;
  text(): Promise<string>;
}

declare export default (url: string, config?: Config) => Promise<Response>
