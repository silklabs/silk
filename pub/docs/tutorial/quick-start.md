# Quick start

Let's get started by building a simple program for Silk and push it to the device.

## Installing Silk

By now you should have installed Silk Cli on your computer (instructions are in the main Readme file). But if you haven't, just run:

```
npm install -g silk-cli
```

## Installing the emulator

You would need somewhere to test your code in, so if you don't have a device to run Silk programs on, you can just install the emulator which contains pre-build images of the Silk platform right from NPM by doing:

```bash
npm install -g silk-emulator
```

## Creating a new project

To create a new project: choose your favorite destination on your computer and from the command line hit

```
silk init project_name
```

This will initialize a new node project with the repo name same as project_name that you specified earlier.

## Editing your first Silk program files

Initially, after creating the project, you will find in ins repo a `index.js` file that you could immediately start working on and deploying to either the emulator or a device that has Silk flashed into it.

You will also notice that there is a `device.js` file. Essentially it initializes the two main modules you will need in your program: Wi-Fi and the power button.
Since you will be doing everything in the device using JavaScript, even hardware buttons are controlled that way. So instead of you writing those modules' initialization code, we've made it easy for you and included them in the `device.js` file.

If you're looking for a head start try following one of the tutorials we've prepared for you that include real-life examples of the Silk APIs. [Check them out here](https://github.com/silklabs/silk/tree/master/docs/tutorial).

## Running your program on a device

After you've done editing, it's time to try your program on an actual Silk device. All you have to do is do the following

1. Make sure your device is connected visa USB to the computer
2. run `silk run` from within the repository of the program you created
