# Quick start

Let's get started by building a simple program for Silk and push it to the device.

## Installing Silk

By now you should have installed Silk Cli on your computer (from the main readme). But if you haven't, just run:

```
npm install -g silk-cli
```

## Creating a new project

To create a new project: choose your favorite destination on your computer and from the command line hit

```
silk init project_name
```

This will initialize a new node project with the repo name same as project_name that you specified earlier.

## Editing your first Silk program files

Initially, after creating the project, you will find in ins repo a `index.js` file that you could immediately start working on and deploying to either the emulator or a Silk-based device.

If you're looking for a head start try following one of the tutorials we've prepared for you that include real-life examples of the Silk APIs. [Check them out here](https://github.com/silklabs/silk/tree/master/docs/tutorial).

## Running your program on a device

After you've done editing, it's time to try your program on an actual Silk device. All you have to do is do the following

1. Make sure your device is connected visa USB to the computer
2. run `silk run` from within the repository of the program you created
