# Silk

Silk is a free (as in free beer) firmware for a number of smartphones based on the open-source Android operating system with a nodejs layer on top of it that makes it possible to write programs and get access to hardware aspects using only simple JavaScript. We offer a wide range of APIs that make developing for the Internet of Things world using web technologies a present reality.

## What is Silk?

Silk is an IoT platform that aims to making programming and developing Internet of Things applications as easy as writing JavaScript via its modern JavaScript/node/npm environment.

## How to get started?

### Silk CLI

First off you need to install the Silk Command Line Interface, with which you will be able to push your Silk programs to the device or emulator.

Install Silk CLI by running
```
npm install -g silk-cli
```

### Silk ROMs for devices

If you have one of the devices supported by Silk, you can flash it with a Silk rom. See [Compatibility and Roms](docs/compatibility-roms.md) to find out what devices we support and links to download ROMs for them.

### Silk emulator

If you don't have a compatible device, you can still run Silk using our emulator.

Just run
```
npm install -g silk-emulator
```

### Write code

All you have to do then is create a new program with the Silk CLI by running
```
silk init <program_name>
```
It will create a new node package you can start hacking on immediately. Here's the full list of Silk commands that you can use with the CLI: [Silk Command Line Interface Reference](docs/tutorial/cli-reference.md).

We offer a robust set of API you can use in your Silk program. Check them all out: [Silk API reference](http://api.silk.io).

Also don't forget to check out the links in the `Resources` of this page for all the code examples you can try right away.

### Push code to Silk, see it live

Done with the code? Time to try your code. Simply push your program to the device/emulator.

First make sure it's connected:
```
adb devices
```

And if it shows up, just type
```
silk run
```

You're now good to go, if you've done everything correctly, your program should be up and running!

## Release notes

Silk is updated on a regular basis, make sure to check out the [Release notes](docs/release-notes.md)

## Contributing

Nice to hear you want to help! If you are interested in fixing issues and contributing directly to the code base, please see the document [How to the contribute](CONTRIBUTING.md).

## Building

If you like, you can build Silk from the source we offer. It also helps to start here if you are planning to port Silk to a device. Head out to [Building instructions for Linux and OS X](docs/development/build-instructions-linux-osx.md), or for [Windows](docs/development/build-instructions-vm-on-windows.md) (using a Virtual Machine).

## Resources

**Useful links:**

- [All about Downloading and Installing Silk](docs/tutorial/installing-silk.md)
- [Quick start with Silk](docs/tutorial/quick-start.md)
- [Silk Command Line Interface Reference](docs/tutorial/cli-reference.md)
- [Silk APIs reference](http://api.silk.io)

**Examples to follow:**

- [Emit an iBeacon from the device](docs/tutorial/ble-example.md)
- [Camera Face Detection](docs/examples/camera-facedetect)
- [Scanning for nearby bluetooth devices](docs/examples/ble-example-1)

## FAQ and Feedback

- Ask a question, request a feature, bring us feedback or check the FAQ in [our forums](https://community.silklabs.com)
- File a bug in [GitHub Issues](https://github.com/silklabs/silk/issues)

## Disclaimer

Silk is still in its early stages and constantly evolving. Don't grow attached to the current APIs. They will likely change and there will be bugs.

## License

MIT License. See LICENSE for full text.

Files reused from other 3rd party projects may be licensed under other Open Source licenses. Please refer to individual files for details.
