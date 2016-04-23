# Build Instructions (Linux & OS X)
The instructions below will help you build Silk for the supported devices on Linux and OS X.

## Prerequisites

* For Linux users: see [Prerequisites (Linux)](prerequisites-linux.md)
* For OS X users: see [Prerequisites (OS X)](prerequisites-osx.md)

### Building and using the emulator


```bash
git clone https://github.com/silklabs/silk.git
cd silk/bsp-gonk/
./sync qemu
source build/envsetup.sh
make -j4
./run-emulator
```

In a new terminal:
```bash
adb wait-for-device
adb logcat
```

### Building for Nexus 4 (mako)

#### Cloning

Cloning should be always the same:
```bash
git clone https://github.com/silklabs/silk.git
cd silk/bsp-gonk/
```

#### Unlocking the bootloader

then, building and flashing for mako is going to need your device's bootloader to be unlocked, if it is you can skip this part. But if you don't know what's unlocking a bootloader, chances are you need to follow these steps as well.

1- Power off your LG / Google Nexus 4 device. Boot it into Fastboot mode by pressing at the same time the Volume down and Power buttons. When the screen shows the “start” text, release the buttons.

2- Connect your device to your computer via USB.

3- Run `fastboot oem unlock` from your terminal.

That should unlock your Nexus 4 device.

#### Building from source

Now for the actual building process:

```bash

./sync mako
source build/envsetup.sh
make -j4
```

#### Flashing to devices

You're going to want to to switch again to Fastboot, but if it's still on it from the unlocking process then you can skip this. Otherwise run:

```bash
adb reboot-bootloader
```

and then make sure fastboot can recognize your device correctly by running
```bash
fastboot devices
```
Your output should be similar to this
`0079aa645d500341        fastboot`
<br/>
Where `0079aa645d500341` will be different for different devices.

```bash
fastboot flash all
```

Which will flash the Silk device img files onto it.
And lastly reboot to Silk by running:

```bash
fastboot reboot
```
After the devices has successfully rebooted. Try running these commands to ensure that it's up and running.

```bash
adb wait-for-device
adb logcat
```

#### Re-flashing
Flashing another img requires to boot into bootloader again whether by following step 1 in *Unlocking the bootloader* section or running

```bash
adb reboot-bootloader
```

and then another

```bash
fastboot flash all
```

#### Flashing a stock Android rom again
If you want to switch back to normal Android, here are the instructions for flashing Android 5.1.1 to your device:

First download the stock Nexus 4 5.1.1 (LMY47V) ROM from https://dl.google.com/dl/android/aosp/occam-lmy47v-factory-b0c4eb3d.tgz
then

```bash
occam-lmy47v-factory-b0c4eb3d.tgz
cd occam-lmy47v
./flash-all.sh
```

For detailed instructions on Flashing a stock rom, head out to the [official Google Developers page](https://developers.google.com/android/nexus/images).

Happy hacking!
