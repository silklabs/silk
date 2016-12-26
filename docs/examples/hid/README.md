# silk-hid
Demo of issuing keyboard and mouse HID reports, enabling a Silk device to appear
as a normal USB keyboard or mouse.

# Usage
1. Flash the device with the latest Silk platform.  A Linux kernel patch is
required to enable the HID devices used by this demo.  At the time of this
writing, only the Kenzo device has the required [patch](https://github.com/silklabs/silk/commit/e94263c661283f912d463a10ff88a588d352a33b)
2. `npm install`, then `silk run`
