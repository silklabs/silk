# Build Instructions on a VM in Windows

You can't really build on Windows natively. So for this tutorial, if you have Windows, you will have to install a Virtual Machine.

## Getting Virtual Box

* Download VirtualBox from https://www.virtualbox.org/wiki/Downloads

* Install the "VirtualBox Extension Pack" from the host machine (https://www.virtualbox.org/wiki/Downloads) _for your exact version of VirtualBox_. For example, if you have VB 5.0.0 installed, you must use the Extension Pack version 5.0.0. Otherwise if you have a version mismatch, **VirtualBox will crash**.

## Installing Ubunutu 14.04 on VB

* Download [Ubuntu 14.04 64-bit](http://releases.ubuntu.com/14.04/) desktop image (ubuntu-14.04.2-desktop-amd64.iso).
* Create new VirtualBox VM: New -> Linux 64-bit -> 8196MB RAM, create virtual hard disk, VDI image, dynamically allocated, 30GB-60GB image.
* Configure VM:
  * Changed network to bridged adapter and virtio-net (advanced setting).
  * Changed System -> Processors to 4.
  * Change Ports -> USB to USB 3.0 (xHCI) Controller
* Add the Ubuntu ISO, start the VM, and install Ubuntu (use LVM partition)
* Launch the VM
* Install the Guest Additions, "Devices -> Insert Guest Additions CD image...", then follow the installer in the VM

Then open terminal and follow the instructions in [this file](build-instructions-linux-osx.md).
