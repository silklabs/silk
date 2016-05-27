/**
 * @providesModule CBuffer
 * @flow
 */

/**
 * CBuffer doesn't really inherit Array, it just tries to have the same
 * interface. Rather than copying all that here we're just pretending that it
 * does inherit.
 */
declare export class CBuffer<T> extends Array<T> {
  rotateLeft(count: number): CBuffer<T>;
  rotateRight(count: number): CBuffer<T>;
  avg(): number;
  sum(): number;
  median(): number;
  empty(): CBuffer<T>;
  first(): ?T;
  last(): ?T;
  get(index: number): ?T;
  isFull(): boolean;
  set(index: number, value: T): void;
  toArray(): Array<T>;
  size: number;
  overflow: ?((value: T, buffer: CBuffer<T>) => void);
}
