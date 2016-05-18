# Silk Command Line Interface Reference

The Silk Command Line Interface (Silk CLI) is a unified tool designed to provide a consistent interface for interacting with all parts of the Silk platform.

## Synopsis

```bash
silk <command> [argument1, argument2, ...]
```

You can also run `silk help` for a full list of all the commands and their description.

## Available commands

### run

Run the extension on device or emulator.

```bash
silk run
```

### build

Run the silk build script without pushing

```bash
silk build
```

### push

Push files without restarting the main module.

```bash
silk push
```

### activate

Activate given (mark it as main module).

```bash
silk activate
```

#### Arguments

`--clear`, `-c`: Activate the default main module instead of the current package.

### restart

Restart the main module.

```bash
silk restart
```

### start

Start the main module (only useful after using stop).

```bash
silk start
```

### stop

Stop the main module (until the device reboots).

```bash
silk stop
```

### log

Begin tailing log of silk device or emulator.

```bash
silk log
```

### setupwifi

Configure wifi on the device or emulator.

```bash
silk setupwifi SSID PASSWORD
```
