#!/bin/bash -ex
#
# Clean up XCode provisioning profile and keys installed by setup.sh.
# Only meant for CI environments.
#

security delete-keychain ios-build.keychain
rm -f ~/Library/MobileDevice/Provisioning\ Profiles/*
