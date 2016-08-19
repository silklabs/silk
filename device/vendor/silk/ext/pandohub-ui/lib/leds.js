/**
 * Copyright (c) 2016 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 *
 * @flow
 */

import invariant from 'assert';
import fs from 'mz/fs';
import path from 'path';
import lights, {Light} from 'silk-lights';
import type {LightColor} from 'silk-lights';
import * as sysutil from 'silk-sysutils';

/**
 * Opcodes for the LP55321 micro controller
 *
 * Reference: http://www.ti.com/lit/ds/symlink/lp55231.pdf
 */
type LedAsmOpCode = number; // 16-bit opcode
class LedAsm {
  //eslint-disable-next-line camelcase
  static mux_map_next(): LedAsmOpCode {
    return 0x9d80;
  }

  //eslint-disable-next-line camelcase
  static mux_sel(led: number): LedAsmOpCode {
    invariant(led >= 1 && led <= 9);
    return 0x9d00 + led;
  }

  //eslint-disable-next-line camelcase
  static set_pwm(brightness: number): LedAsmOpCode {
    invariant(brightness >= 0 && brightness <= 255);
    return 0x4000 + brightness;
  }

  static ramp(prescale: number, steptime: number, steps: number): LedAsmOpCode {
    // prescale = 0: 0.488 * steptime milliseconds per step
    // prescale = 1: 15.625 * steptime milliseconds per step
    invariant(prescale === 0 || prescale === 1, `Bad prescale: ${prescale}`);
    invariant(steptime >= 1 && steptime <= 31, `Bad steptime: ${steptime}`);
    invariant(steps >= -255 && steps <= 255, `Bad steps: ${steps}`);
    let sign = 0;
    if (steps < 0) {
      steps *= -1;
      sign = 1;
    }
    return (prescale << 14) + (steptime << 9) + (sign << 8) + steps;
  }

  static branch(loopcount: number, stepnumber: number): LedAsmOpCode {
    // loopcount = 0: unconditional
    // loopcount > 0: branch N times
    invariant(loopcount >= 0 && loopcount <= 63);
    invariant(stepnumber >= 0 && stepnumber <= 63);
    return 0xa000 + stepnumber + (loopcount << 7);
  }

  static wait(prescale: number, cycles: number): LedAsmOpCode {
    // prescale = 0: wait 0.488 * cycles milliseconds
    // prescale = 1: wait 15.625 * cycles milliseconds
    return LedAsm.ramp(prescale, cycles, 0);
  }

  static rst(): LedAsmOpCode {
    return 0x0000;
  }

  static end(): LedAsmOpCode {
    return 0xc000;
  }
}

/**
 * This class represents one of the 3 engines on the LP55321 micro controller
 */
class LedControllerEngine {
  _mode: number;
  _leds: number;
  _load: number;

  static async create(filepath: string, engineId: number): Promise<LedControllerEngine> {
    let ce = new LedControllerEngine();
    await ce._init(filepath, engineId);
    return ce;
  }

  async _init(filepath: string, engineId: number): Promise<void> {
    const [mode, load, leds] = await Promise.all([
      fs.open(path.join(filepath, `engine${engineId}_mode`), 'w'),
      fs.open(path.join(filepath, `engine${engineId}_load`), 'w'),
      fs.open(path.join(filepath, `engine${engineId}_leds`), 'w'),
    ]);
    this._mode = mode;
    this._load = load;
    this._leds = leds;
  }

  async deinit(): Promise<void> {
    await Promise.all([
      fs.close(this._mode),
      fs.close(this._leds),
      fs.close(this._load),
    ]);
  }

  async load(leds: string, program: string): Promise<void> {
    await fs.write(this._mode, 'load', 0);
    await fs.write(this._load, program, 0);
    await fs.write(this._leds, leds, 0);
  }

  async run(): Promise<void> {
    await fs.write(this._mode, 'run', 0);
  }

  async disable(): Promise<void> {
    await fs.write(this._mode, 'disabled', 0);
  }
}

/**
 * This class represents the three execution engines of a LP55321 micro controller
 */
class LedController {
  _filepath: string;
  _engine: Array<LedControllerEngine>;

  /**
   * @param {name} The name assigned to this micro controller by the kernel
   */
  static async create(name: string): Promise<LedController> {
    let c = new LedController();
    await c._init(name);
    return c;
  }

  async _init(name: string): Promise<void> {
    this._filepath = path.join('/sys/bus/i2c/drivers/lp5523x', name);
    await fs.access(this._filepath);
    this._engine = await Promise.all([
      LedControllerEngine.create(this._filepath, 1),
      LedControllerEngine.create(this._filepath, 2),
      LedControllerEngine.create(this._filepath, 2),
    ]);
  }


  static _opcodeToHex(opcode: LedAsmOpCode): string {
    return ('0000' + opcode.toString(16)).substr(-4);
  }

  /**
   * Set the brightness of a single LED on the controller
   */
  async set(ledName: string, brightness: number): Promise<void> {
    invariant(brightness >= 0 && brightness <= 255);
    await fs.writeFile(path.join(this._filepath, 'leds', ledName, 'brightness'),
      brightness.toString());
  }

  /**
   * Loads a program into one of the engine
   *
   * @param {engineId} Which engine to load
   * @param {leds} Bitmask of LEDs to affect
   * @param {asm} Program opcodes
   */
  async load(engineId: number, leds: string, asm: Array<LedAsmOpCode>): Promise<void> {
    invariant(engineId >= 1 && engineId <= 3, `Invalid engineId: ${engineId}`);
    invariant(leds.length === 9, `Bad leds length: ${leds.length}`);

    const program = asm.reduce((p, o) => p + LedController._opcodeToHex(o), '') +
      LedController._opcodeToHex(LedAsm.end());
    invariant(program.length % 4 === 0, `Bad program length: ${program.length}`);
    invariant(program.length / 4 < 96, `Program too long: ${program.length / 4} opcodes`);
    await this._engine[engineId - 1].load(leds, program);
  }

  /**
   * Starts the specified engine
   */
  async run(engineId: number): Promise<void> {
    invariant(engineId >= 1 && engineId <= 3, `Invalid engineId: ${engineId}`);
    await this._engine[engineId - 1].run();
  }

  /**
   * Disables the specified engine
   */
  async disable(engineId: number): Promise<void> {
    invariant(engineId >= 1 && engineId <= 3, `Invalid engineId: ${engineId}`);
    await this._engine[engineId - 1].disable();
  }

  /**
   * Disables all engines on this micro controller
   */
  async disableAll(): Promise<void> {
    await Promise.all(this._engine.map(e => e.disable()));
  }
}


/*
  The light ring is driven by four LP55321 controllers, named 5-0032..5-0035,
  which all have the same LED mapping:
      1: G
      2: B
      3: G
      4: B
      5: G
      6: B
      7: R
      8: R
      9: R

  The light ring controller orientation is as follows, where 12 o'clock points to the
  power button:
      5-0032: 5 o'clock
      5-0033: 7 o'clock
      5-0034: 2 o'clock
      5-0035: 11 o'clock

 */
export class Ring {
  _ctl: Array<LedController>; // Controllers ordered clockwise from 12 o'clock

  static async create(): Promise<Ring> {
    let ring = new Ring();
    await ring._init();
    return ring;
  }

  async _init(): Promise<void> {

    this._ctl = await Promise.all([
      LedController.create('5-0034'), // Funny order is to ensure the controllers
      LedController.create('5-0032'), // are ordered clockwise from 12 o'clock.
      LedController.create('5-0033'),
      LedController.create('5-0035'),
    ]);

    await this._disableAll();
  }

  async _forceOff(): Promise<void> {
    // Test code to force all the LEDs off individually.  Normally not required.
    let [c34, c32, c33, c35] = this._ctl;
    await Promise.all(
      [].concat(
        [ 'd607:R', 'd607:G', 'd607:B',
          'd608:R', 'd608:G', 'd608:B',
          'd609:R', 'd609:G', 'd609:B' ].map(led => c34.set(led, 0)),
        [ 'd601:R', 'd601:G', 'd601:B',
          'd602:R', 'd602:G', 'd602:B',
          'd603:R', 'd603:G', 'd603:B' ].map(led => c32.set(led, 0)),
        [ 'd604:R', 'd604:G', 'd604:B',
          'd605:R', 'd605:G', 'd605:B',
          'd606:R', 'd606:G', 'd606:B' ].map(led => c33.set(led, 0)),
        [ 'd610:R', 'd610:G', 'd610:B',
          'd611:R', 'd611:G', 'd611:B',
          'd612:R', 'd612:G', 'd612:B' ].map(led => c35.set(led, 0))
      )
    );
  }

  async _disable(engineId: number): Promise<void> {
    await Promise.all(this._ctl.map(c => c.disable(engineId)));
  }

  async _disableAll(): Promise<void> {
    await Promise.all(this._ctl.map(c => c.disableAll()));
  }

  async _load(engineId: number, leds: string, asm: Array<LedAsmOpCode>): Promise<void> {
    await Promise.all(this._ctl.map(c => c.load(engineId, leds, asm)));
  }

  async _run(...engineIds: Array<number>): Promise<void> {
    let runners = [];

    for (let c of this._ctl) {
      for (let e of engineIds) {
        runners.push(c.run(e));
      }
    }
    await Promise.all(runners);
  }

  async initializing(): Promise<void> {
    await this._disableAll();

    // Green and red LEDs off
    await this._load(1, '101010111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);

    // Rotate through the blue LEDs
    await this._load(2, '010101000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
      LedAsm.mux_sel(2),
      LedAsm.ramp(0, 1, 255),
      LedAsm.mux_sel(6),
      LedAsm.ramp(0, 1, -255),
      LedAsm.mux_sel(4),
      LedAsm.ramp(0, 1, 255),
      LedAsm.mux_sel(2),
      LedAsm.ramp(0, 1, -255),
      LedAsm.mux_sel(6),
      LedAsm.ramp(0, 1, 255),
      LedAsm.mux_sel(4),
      LedAsm.ramp(0, 1, -255),
      LedAsm.branch(0, 2),
    ]);

    await this._run(1, 2);
  }

  async unconfigured(): Promise<void> {
    await this._disableAll();

    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];

    // All LEDs off
    await this._load(1, '111111111', progyOff);
    await this._run(1);

    // Red animation
    await Promise.all(
      this._ctl.map((c, index) => {
        let progyPreWait = [];
        let progyPostWait = [];
        switch (index) {
        case 0:
        case 2:
          progyPostWait = [
            LedAsm.ramp(0, 5, -255),
          ];
          break;
        case 1:
        case 3:
          progyPreWait = [
            LedAsm.ramp(0, 5, -255),
          ];
          break;
        default:
          invariant(false);
        }
        const progyRamp = [
          LedAsm.mux_sel(7),
          LedAsm.ramp(0, 1, 255),
          LedAsm.wait(1, 6),
          LedAsm.mux_sel(8),
          LedAsm.ramp(0, 1, 255),
          LedAsm.mux_sel(7),
          LedAsm.ramp(0, 1, -255),
          LedAsm.mux_sel(9),
          LedAsm.ramp(0, 1, 255),
          LedAsm.mux_sel(8),
          LedAsm.ramp(0, 1, -255),
          LedAsm.wait(1, 6),
          LedAsm.mux_sel(9),
          LedAsm.ramp(0, 1, -255),
        ];
        const progy = [].concat(
          progyPreWait,
          progyRamp,
          progyPostWait,
          [ LedAsm.branch(0, 0) ],
        );
        return c.load(1, '000000000', progy);
      })
    );
    await this._run(1);
  }

  async listening(): Promise<void> {
    await this._disableAll();

    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];

    // All LEDs off
    await this._load(1, '111111111', progyOff);
    await this._run(1);

    // Blue animation
    await Promise.all(
      this._ctl.map((c, index) => {
        let progyPreWait = [];
        let progyPostWait = [];
        switch (index) {
        case 0:
        case 2:
          progyPostWait = [
            LedAsm.ramp(0, 5, -255),
          ];
          break;
        case 1:
        case 3:
          progyPreWait = [
            LedAsm.ramp(0, 5, -255),
          ];
          break;
        default:
          invariant(false);
        }
        const progyRamp = [
          LedAsm.mux_sel(2),
          LedAsm.ramp(0, 1, 255),
          LedAsm.wait(1, 6),
          LedAsm.mux_sel(4),
          LedAsm.ramp(0, 1, 255),
          LedAsm.mux_sel(2),
          LedAsm.ramp(0, 1, -255),
          LedAsm.mux_sel(6),
          LedAsm.ramp(0, 1, 255),
          LedAsm.mux_sel(4),
          LedAsm.ramp(0, 1, -255),
          LedAsm.wait(1, 6),
          LedAsm.mux_sel(6),
          LedAsm.ramp(0, 1, -255),
        ];
        const progy = [].concat(
          progyPreWait,
          progyRamp,
          progyPostWait,
          [ LedAsm.branch(0, 0) ],
        );
        return c.load(1, '000000000', progy);
      })
    );
    await this._run(1);
  }

  async volume(level: number): Promise<void> {
    invariant(level >= 0 && level <= 12, `Bad volume: ${level}`);
    await this._disableAll();

    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];

    const [cur, clr, cll, cul] = this._ctl;

    await Promise.all([cll, cul, cur, clr].map((c, index) => {
      function makeVolumeProgy(led1, led2, led3) {
        let progyWait = [];
        if (index > 0) {
          progyWait = [
            LedAsm.mux_sel(led1),
            LedAsm.ramp(0, 1, -128),
            LedAsm.branch(3 * index, 2),
          ];
        }

        const progyRamp = [
          LedAsm.mux_sel(led1),
          LedAsm.ramp(0, 1, level > (index * 3) ? 128 : -128),
          LedAsm.mux_sel(led2),
          LedAsm.ramp(0, 1, level > (index * 3 + 1) ? 128 : -128),
          LedAsm.mux_sel(led3),
          LedAsm.ramp(0, 1, level > (index * 3 + 2) ? 128 : -128),
        ];
        return [].concat(progyOff, progyWait, progyRamp);
      }

      return Promise.all([
        c.load(2, '101010000', makeVolumeProgy(1, 3, 5)), // Green LEDs
        c.load(1, '010101000', makeVolumeProgy(2, 4, 6)), // Blue LEDs
        c.load(3, '000000111', makeVolumeProgy(7, 8, 9)),  // Red LEDs
      ]);
    }));

    await this._run(1, 2, 3);
  }

  async finishedDialog(): Promise<void> {
    await this._disableAll();

    // Green and red LEDs off
    await this._load(1, '101010111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);

    // Ramp down blue LEDs one at a time
    let [cur, clr, cll, cul] = this._ctl;
    const progyFade1 = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(128),
      LedAsm.wait(1, 16), // 250ms
      LedAsm.mux_sel(6),
      LedAsm.ramp(0, 2, -128),
      LedAsm.mux_sel(4),
      LedAsm.ramp(0, 2, -128),
      LedAsm.mux_sel(2),
      LedAsm.ramp(0, 2, -128),
    ];
    const progyFade2 = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(128),
      LedAsm.wait(1, 16), // 250ms
      LedAsm.mux_sel(2),
      LedAsm.ramp(0, 2, -128),
      LedAsm.mux_sel(4),
      LedAsm.ramp(0, 2, -128),
      LedAsm.mux_sel(6),
      LedAsm.ramp(0, 2, -128),
    ];

    await Promise.all([
      cur.load(2, '010101000', progyFade2),
      clr.load(2, '010101000', progyFade1),
      cll.load(2, '010101000', progyFade2),
      cul.load(2, '010101000', progyFade1),
    ]);

    await this._run(1, 2);
  }

  async configuring(): Promise<void> {
    await this._disableAll();

    // Glow red LEDs
    await this._load(1, '000000111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
      LedAsm.mux_sel(7),
      LedAsm.ramp(0, 1, 255),
      LedAsm.mux_sel(9),
      LedAsm.ramp(0, 1, -255),
      LedAsm.mux_sel(8),
      LedAsm.ramp(0, 1, 255),
      LedAsm.mux_sel(7),
      LedAsm.ramp(0, 1, -255),
      LedAsm.mux_sel(9),
      LedAsm.ramp(0, 1, 255),
      LedAsm.mux_sel(8),
      LedAsm.ramp(0, 1, -255),
      LedAsm.branch(0, 2),
    ]);

    // Green and blue LEDs off
    await this._load(2, '111111000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);
    await this._run(1, 2);
  }

  /*async*/ processing(): Promise<void> {
    return this.initializing();
  }

  async online(): Promise<void> {
    await this._disableAll();
    await this._load(1, '111111111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);
    await this._run(1);
  }

  async silent(): Promise<void> {
    await this._disableAll();

    // RGB LEDs on at 50%
    await this._load(1, '111111111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(128),
    ]);

    await this._run(1);
  }

  async mute(): Promise<void> {
    await this._disableAll();

    // Red LEDs on
    await this._load(1, '000000111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(255),
    ]);

    // Blue and green LEDs off
    await this._load(2, '111111000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);

    await this._run(1, 2);
  }

  async speaking(): Promise<void> {
    await this._disableAll();

    const brightnessMin = Math.floor(255 * 0.20);
    const brightnessMax = Math.floor(255 * 0.80);

    // Glow blue LEDs
    await this._load(1, '010101000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightnessMin),
      LedAsm.ramp(0, 10, brightnessMax - brightnessMin),
      LedAsm.ramp(0, 10, -(brightnessMax - brightnessMin)),
      LedAsm.branch(0, 1),
    ]);

    // Green and red LEDs off
    await this._load(2, '101010111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);

    await this._run(1, 2);
  }

  async speakingError(): Promise<void> {
    await this._disableAll();

    const brightnessMin = Math.floor(255 * 0.20);
    const brightnessMax = Math.floor(255 * 0.80);

    // Glow red LEDs
    await this._load(1, '000000111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightnessMin),
      LedAsm.ramp(0, 10, brightnessMax - brightnessMin),
      LedAsm.ramp(0, 10, -(brightnessMax - brightnessMin)),
      LedAsm.branch(0, 1),
    ]);

    // Green LEDs lowish
    await this._load(2, '101010000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(64),
    ]);

    // Blue LEDs off
    await this._load(3, '010101000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);

    await this._run(1, 2, 3);
  }

  async unconfiguredPing(): Promise<void> {
    await this._disableAll();

    // Red LEDs blink
    await this._load(1, '000000111', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(255),
      LedAsm.wait(1, 16), // 250ms
      LedAsm.set_pwm(0),
      LedAsm.wait(1, 16), // 250ms
      LedAsm.branch(3, 1),
      LedAsm.set_pwm(0),
    ]);
    // Green LEDs blink at 50%
    await this._load(2, '101010000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(64),
      LedAsm.wait(1, 16), // 250ms
      LedAsm.set_pwm(0),
      LedAsm.wait(1, 16), // 250ms
      LedAsm.branch(3, 1),
      LedAsm.set_pwm(0),
    ]);
    // Blue LEDs off
    await this._load(3, '010101000', [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ]);

    await this._run(1, 2, 3);
  }
}

class NightlightRGB extends Light {
  _nightlight: Nightlight;

  constructor(nightlight: Nightlight) {
    super('nightlightRgb');
    this._nightlight = nightlight;
    this._color = sysutil.getintprop('persist.silk.nightlight.rgb', lights.WHITE);
    if (this._color < 0 || this._color > lights.WHITE) {
      this._color = lights.WHITE;
    }
    this._nightlight.setUserColor(this._color);
  }

  _update(): Promise<void> { // Overrides the Light._update() implementation
    sysutil.setprop('persist.silk.nightlight.rgb', this._color);
    this._nightlight.setUserColor(this._color);
    this.emit('change');
    return Promise.resolve();
  }
}

class NightlightWhite extends Light {
  _nightlight: Nightlight;

  constructor(nightlight: Nightlight) {
    super('nightlightWhite');
    this._nightlight = nightlight;

    this._color = sysutil.getintprop('persist.silk.nightlight.white', -1);
    this._colorMax = 255;
    if (this._color < 0 || this._color > this._colorMax) {
      this._color = 127; // 50%
    }
    this._nightlight.setUserBrightness(this._color);
  }

  _update(): Promise<void> { // Overrides the Light._update() implementation
    sysutil.setprop('persist.silk.nightlight.white', this._color);
    this._nightlight.setUserBrightness(this._color);
    this.emit('change');
    return Promise.resolve();
  }
}

/*
  The nightlight is driven by three LP55321 controllers named 1-0032, 1-0033,
  and 1-0034 with the following LED mapping:

    1-0032
      1: D3002 (W)
      2: D3004 (W)
      3: -
      4: -
      5: D509 (W)
      6: D510 (W)
      7: D3011 (R)
      8: D3012 (R)
      9: -

    1-0033:
      1: D3001 (W)
      2: D3010 (W)
      3: D3003 (G)
      4: D3005 (G)
      5: D3013 (B)
      6: D3014 (B)
      7: -
      8: -
      9: -

    1-0034:
      1: D501 (W)
      2: D502 (W)
      3: D504 (G)
      4: D505 (B)
      5: D507 (G)
      6: D508 (B)
      7: -
      8: D503 (R)
      9: D506 (R)
*/
export class Nightlight {
  _ctl: Array<LedController>;
  _userBrightness: number = 0;
  _userColor: LightColor = 0;
  _userActive: boolean = false;

  static async create(): Promise<Nightlight> {
    let nightlight = new Nightlight();
    await nightlight._init();
    return nightlight;
  }

  constructor() {
    lights.addCustomLight(new NightlightRGB(this));
    lights.addCustomLight(new NightlightWhite(this));
  }

  async _init(): Promise<void> {
    this._ctl = await Promise.all([
      LedController.create('1-0032'),
      LedController.create('1-0033'),
      LedController.create('1-0034'),
    ]);
    await this._disableAll();
  }

  async _forceOff(): Promise<void> {
    // Test code to force all the LEDs off individually.  Normally not required.
    let [c32, c33, c34] = this._ctl;
    await Promise.all(
      [].concat(
        [ 'd3002:W', 'd3004:W', 'd509:W',
          'd510:W', 'd3011:R', 'd3012:R' ].map(led => c32.set(led, 0)),
        [ 'd3001:W', 'd3010:W', 'd3003:G',
          'd3005:G', 'd3013:B', 'd3014:B' ].map(led => c33.set(led, 0)),
        [ 'd501:W', 'd502:W', 'd504:G',
          'd505:B', 'd507:G', 'd508:B',
          'd503:R', 'd506:R' ].map(led => c34.set(led, 0)),
      )
    );
  }

  // Sets all the white LEDs to the given brightness
  async _loadPureWhite(engineId: number, brightness: number): Promise<void> {
    const progy = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightness),
    ];

    let [ c32, c33, c34 ] = this._ctl;
    await Promise.all([
      c32.load(engineId, '110011000', progy),
      c33.load(engineId, '110000000', progy),
      c34.load(engineId, '110000000', progy),
    ]);
  }

  async _disableAll(): Promise<void> {
    await Promise.all(this._ctl.map(c => c.disableAll()));
  }

  async _run(...engineIds: Array<number>): Promise<void> {
    let runners = [];

    for (let c of this._ctl) {
      for (let e of engineIds) {
        runners.push(c.run(e));
      }
    }
    await Promise.all(runners);
  }

  setUserColor(color: LightColor) {
    this._userColor = color;
  }

  setUserBrightness(brightness: number) {
    this._userBrightness = brightness;
  }

  async userColor(): Promise<void> {
    const brightness = this._userBrightness;
    const color = this._userColor;

    // For now don't attempt to handle RGB LED intensity beyond binary, and rely
    // just on the dedicated White LEDs to manage brightness
    const maybeOff = brightness > 0 ? 1 : 0;

    const red = maybeOff * ((color & 0xFF0000) >> 16);
    const green = maybeOff * ((color & 0x00FF00) >> 8);
    const blue = maybeOff * (color & 0x0000FF);

    await this._disableAll();

    const progy32 = [
      LedAsm.mux_sel(1),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(2),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(5),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(6),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(7),
      LedAsm.set_pwm(red),
      LedAsm.mux_sel(8),
      LedAsm.set_pwm(red),
    ];

    const progy33 = [
      LedAsm.mux_sel(1),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(2),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(3),
      LedAsm.set_pwm(green),
      LedAsm.mux_sel(4),
      LedAsm.set_pwm(green),
      LedAsm.mux_sel(5),
      LedAsm.set_pwm(blue),
      LedAsm.mux_sel(6),
      LedAsm.set_pwm(blue),
    ];

    const progy34 = [
      LedAsm.mux_sel(1),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(2),
      LedAsm.set_pwm(brightness),
      LedAsm.mux_sel(3),
      LedAsm.set_pwm(green),
      LedAsm.mux_sel(4),
      LedAsm.set_pwm(blue),
      LedAsm.mux_sel(5),
      LedAsm.set_pwm(green),
      LedAsm.mux_sel(6),
      LedAsm.set_pwm(blue),
      LedAsm.mux_sel(8),
      LedAsm.set_pwm(red),
      LedAsm.mux_sel(9),
      LedAsm.set_pwm(red),
    ];

    let [ c32, c33, c34 ] = this._ctl;
    await Promise.all([
      c32.load(1, '000000000', progy32),
      c33.load(1, '000000000', progy33),
      c34.load(1, '000000000', progy34),
    ]);
    await this._run(1);
  }

  async blue(): Promise<void> {
    const brightness = Math.floor(255 * 0.30);

    await this._disableAll();
    await this._loadPureWhite(1, brightness);

    let [ c32, c33, c34 ] = this._ctl;

    // Turn blue LEDS on
    const progyOn = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightness),
    ];
    await Promise.all([
      c32.load(2, '000000000', progyOn),
      c33.load(2, '000011000', progyOn),
      c34.load(2, '000101000', progyOn),
    ]);

    // Turn red and green LEDS off
    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];
    await Promise.all([
      c32.load(3, '000000110', progyOff),
      c33.load(3, '001100000', progyOff),
      c34.load(3, '001010011', progyOff),
    ]);

    await this._run(1, 2, 3);
  }

  async blueWithGlow(): Promise<void> {
    const brightnessMin = Math.floor(255 * 0.30);
    const brightnessMax = Math.floor(255 * 0.80);

    await this._disableAll();

    let [ c32, c33, c34 ] = this._ctl;

    const progyGlow = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightnessMin),
      LedAsm.ramp(0, 12, brightnessMax - brightnessMin),
      LedAsm.ramp(0, 12, -(brightnessMax - brightnessMin)),
      LedAsm.branch(0, 1),
    ];

    // Glow white LEDs
    await Promise.all([
      c32.load(1, '110011000', progyGlow),
      c33.load(1, '110000000', progyGlow),
      c34.load(1, '110000000', progyGlow),
    ]);

    // Glow blue LEDs
    await Promise.all([
      c32.load(2, '000000000', progyGlow),
      c33.load(2, '000011000', progyGlow),
      c34.load(2, '000101000', progyGlow),
    ]);

    // Turn red and green LEDs off
    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];

    await Promise.all([
      c32.load(3, '000000110', progyOff),
      c33.load(3, '001100000', progyOff),
      c34.load(3, '001010011', progyOff),
    ]);

    await this._run(1, 2, 3);
  }

  async red(): Promise<void> {
    const brightness = Math.floor(255 * 0.30);

    await this._disableAll();
    await this._loadPureWhite(1, brightness);

    let [ c32, c33, c34 ] = this._ctl;

    // Turn red LEDS on
    const progyOn = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightness),
    ];
    await Promise.all([
      c32.load(2, '000000110', progyOn),
      c33.load(2, '000000000', progyOn),
      c34.load(2, '000000011', progyOn),
    ]);

    // Turn blue and green LEDS off
    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];

    await Promise.all([
      c32.load(3, '000000000', progyOff),
      c33.load(3, '001111000', progyOff),
      c34.load(3, '001111000', progyOff),
    ]);

    await this._run(1, 2, 3);
  }

  async orange(): Promise<void> {
    const brightness = Math.floor(255 * 0.30);

    await this._disableAll();

    let [ c32, c33, c34 ] = this._ctl;

    // Turn red LEDS on
    const progyOn = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(brightness),
    ];
    await Promise.all([
      c32.load(1, '000000110', progyOn),
      c33.load(1, '000000000', progyOn),
      c34.load(1, '000000011', progyOn),
    ]);

    // Turn green LEDS on at lesser brightness
    const progyHalfOn = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(Math.floor(brightness * 0.75)),
    ];

    await Promise.all([
      c32.load(2, '000000000', progyHalfOn),
      c33.load(2, '000011000', progyHalfOn),
      c34.load(2, '001010000', progyHalfOn),
    ]);

    // Turn blue LEDS off
    const progyOff = [
      LedAsm.mux_map_next(),
      LedAsm.set_pwm(0),
    ];

    await Promise.all([
      c32.load(3, '000000000', progyOff),
      c33.load(3, '001100000', progyOff),
      c34.load(3, '000101000', progyOff),
    ]);

    await this._run(1, 2, 3);

    // Set the white LEDs on.  Note that this is a race condition as we are out
    // of controller engines so engine 1 is re-used.
    await this._loadPureWhite(1, brightness);
    await this._run(1);
  }
}

