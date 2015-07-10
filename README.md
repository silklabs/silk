# Silk Gonk Build [![Build Status](https://magnum.travis-ci.com/silklabs/silk-device.svg?token=9zqxLJky1XFHahNndToB)](https://magnum.travis-ci.com/silklabs/silk-device)

## Configuring Nexus 4 (Mako)

First load the device with the stock Nexus 4 5.1.1 (LMY47V) ROM from
https://dl.google.com/dl/android/aosp/occam-lmy47v-factory-b0c4eb3d.tgz and
ensure the device is functioning normally.

Then obtain the latest Silk Nexus 4 ROM:

```
$ wget https://s3-us-west-2.amazonaws.com/silk-device/master/latest/mako.tgz
$ tar zxf mako.tgz
$ cd aosp_mako/
$ ./flash.sh
```

## Building 101

NOTE: You _must_ have a case sensitive file system to build on OS X.  To create one,

0. Open Disk Utility (Cmd-space then type "disk utility")
0. Select New -> Blank Disk Image
0. For "Name", choose "Silk" or something without spaces
0. For "Size", choose Custom -- 10 GB
0. "Format": Case-sensitive; Journaled
0. "Image Format": "sparse disk image"

Finally press "Create" and your new disk will mount at `/Volumes/Silk` (or whatever you named it).

1. ```make``` => downloads (if necessary) and builds the target binaries
2. ```make install``` => installs the build products onto a device

### Updating your workspace

1.  `git pull --rebase` => updates silk-device proper
2. `make sync` => updates the workspace to reflect any gonk manifest changes that were pulled in as a part of (1)

### Cleaning your workspace

In most cases all you need to do is `make clean`.  This preserves any manifest
projects downloaded into the `.repo/` directory by `make sync`

If you really want to restore your workspace back to its pristine state run
`make zest`.

## Connecting to the server

By default the build will connect to the test server at
https://silk-test-server.herokuapp.com/.

If you would like to use a local server for development purposes or otherwise,
configure the device with:

```
$ adb shell setprop persist.silk.server.url http://192.168.0.3:5000/
$ adb shell setprop ctl.restart silk
```
This information is persisted in `/data/property/`. To revert back to the
production server:

```
$ adb shell setprop persist.silk.server.url ""
$ adb shell setprop ctl.restart silk
```

## Activating the full gonk environment

```
$ . build/envsetup.sh
```

Now you may ```godir``` and ```mm``` around.  ```adb sync``` works here
too.

## Building the full Mako image

The default gonk environment is 'base', which is a minimal environment for
building just the Silk userspace components.  This setup requires a configured
device (only Mako at the moment, maybe the emulator soon) to work against.

It's also possible to build a full Mako device image from the tree as well:

```
$ make clean
$ make init.mako
$ make
```

Then flash the full image with
```
$ . build/envsetup.sh
$ fastboot flashall -w  # <-- Only add "-w" if you want to wipe /data and /cache
```

Creating a new device archive is accomplished by running `make dist`

## Building the full Shamu image

Same as Mako but use `make init.shamu` instead.

## Updating a gonk patch

Patch trees are seperated by gonk, and can be found at ```gonk/<name>/patch/```.

An example of updating a patch for the "base" gonk:
```bash
cd external/node
# <hack hack>
git commit -m "New patch"
git format-patch HEAD^
cp *.patch ../../gonk/base/patch/external/node
# <note that the next time |. build/envsetup.sh| is run the patches will be reapplied>
```

## Automated build and test

Builds and tests run on travis-ci.  See current status [here](https://magnum.travis-ci.com/silklabs/silk-device), and also in pull requests that you open.

Travis-ci builds run on linux, Ubuntu 12.04 amd64 machines.  If a build burns only there, you'll usually want to start diagnosing by reproducing on a VM image with similar config:

https://drive.google.com/a/silklabs.net/folderview?id=0B5U_FixPxut_flpZT2ZuOWV6U3ExZUVwMEZqdGZzazcyNHRSU2pJRWJHRFRYQ0dCSEQ2aXM&usp=sharing

## Emacs setup

If you don't use emacs, ignore this.

JavaScript files are tagged to use js2-mode.  [Follow these instructions to install js2-mode](https://github.com/mooz/js2-mode).

## Development ProTips

### Suppressing ESLint

We run eslint on core ES6 files.  It's great for finding bugs but can be annoying during development when it fails builds because of trailing whitespace and so forth.  When iterating during development, you can turn off eslint checking by passing `LAX=1` to make:
```bash
make LAX=1 core.js
```
Remember to run a non-LAX build before sending a pull request though!

### Tombstones

When a native process crashes bionic (via debuggerd) will engrave a tombstone
of it in /data/tombstones/, useful for determining what happened if you didn't
happen to have gdb attached at the time.

To symbolize a tombstone run:
```
$ adb pull /data/tombstones/
$ . build/envsetup.sh
$ ./development/scripts/stack tombstone_00
```

## Appendix

### Stock device manifest for Nexus 4 ("Mako") 5.1.1

```
$ repo init -u https://android.googlesource.com/platform/manifest.git -b android-5.1.1
$ repo sync -j4 --current-branch --no-tags
$ . build/envsetup.sh
$ lunch aosp_mako-eng
$ time make -j8
```

### Recovery image

A nice recovery image is available at [openrecovery-twrp-2.8.5.2-mako.img](https://drive.google.com/a/weavelabs.net/file/d/0B1uhMYctsSarZ2d1VFFiNmMyeE0/view?usp=sharing)

```
$ adb reboot-bootloader
$ fastboot oem unlock
$ fastboot boot openrecovery-twrp-2.8.5.2-mako.img
```

### Configuring Nexus 6 (Shamu)

First load the device with the stock Nexus 6 (LMY47Z) ROM from
https://dl.google.com/dl/android/aosp/shamu-lmy47z-factory-33951732.tgz
and ensure the device is functioning normally.

Enable the boot loader to be unlocked by:

1. Settings -> About phone -> Tap on "Build number" 10 times
2. Back to Developer options and enable "OEM unlocking"

Then obtain the latest Silk Nexus 6 ROM ("shamu-*") from [Google Docs](https://drive.google.com/a/weavelabs.net/folderview?id=0B1uhMYctsSarfmI3ZnJKNXdaOEtTM3VubHVDcEdIZ05VblNuWU81YkZ6X0NtcUU4MU9CWUE&usp=sharing)

After downloading and uncompressing the image, execute the following to flash
your device:
```
$ cd shamu-2015-05-16_194249/  # or whatever the archive is called
$ ./flash.sh
```

Expect to be stuck on the Twiddling Antenna Android "Erasing..." screen for
10-20 minutes upon your first flash.  You will need to manually reflash
`userdata.img` once the Erasing screen is complete (or easier, run `./flash.sh`
again)

### Linux FTW?

Building on Linux is 2x faster, even when running Linux in a VM hosted by OS X.  Travis CI builds your PR on Linux to boot.

TODO: create a docker image that includes all the dependencies needed to setup a Linux machine to build silk-device and link to it here.

### OTA Updates

OTA updates are disabled by default.

To enable updates:
```
$ adb shell setprop persist.silk.update.enabled true
$ adb reboot
```

To disable updates:
```
$ adb shell rm /data/property/persist.silk.update.enabled
$ adb reboot
```
