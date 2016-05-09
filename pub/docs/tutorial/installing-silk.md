# Downloading and Installing Silk

Whether you're an experienced Android developer/user or you're just getting started with how flashing works. Here's a tutorial that makes it easy to get Silk running on a phone so you can start writing JavaScript on top of it right away.

## Downloads

For now we provide nightly builds that are generated daily and contain the very latest code we push.

### Nexus 4 (mako)

- Latest nightly build: [download](#)

### Xiaomi Redmi Note 3 PRO (kenzo)

- Latest nightly build: [download](#)

## Flashing and Installing Silk

### Flashing for the first time

If this is the first time you flash Silk, plug your device to your computer via USB and make sure your device is detected in ADB by running

```bash
adb devices
```

And if all good you should an output along the lines of

```bash
List of devices attached
04157df49c17d336    device
```

Which means you are ready to flash Silk into your device.

So after downloading the compressed file that ends with `.tgz` enter respectively the following commands in your terminal from the folder you downloaded the file to:

```bash
silk-mako-nightly-20160504150933.tgz
cd silk-mako-nightly-20160504150933
./flash-all.sh
```

And `silk-mako-nightly-20160504150933` can be something else depending on your download type/date and platform target. Just make sure to match the name of the downloaded file with what you put after the `cd` command.

### Updating Silk on device

If you've got Silk already installed in your phone, make sure the device is up and running (which will expose ADB to your computer) AND plugged to your computer then repeat the same steps from the previous section of right after downloading the compressed binaries. Which means typing once more:

```bash
silk-mako-nightly-20160504150933.tgz
cd silk-mako-nightly-20160504150933
./flash-all.sh
```
