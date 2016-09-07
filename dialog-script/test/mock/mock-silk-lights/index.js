import invariant from 'assert';
import EventEmitter from 'events';

class Light extends EventEmitter {
  set color(val: number) {
    invariant(val >= 0 && val <= 0xFFFFFF);
  }
}

class Lights {
  get(lightId: string): Light {
    invariant(lightId === 'nightlight');
    return new Light();
  }
}

let lights = new Lights();
export default lights;
