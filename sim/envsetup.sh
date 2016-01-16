#
# Setup the simulator shell environment.
#
# |source| this file from a bash shell.
#

cd $(dirname "${BASH_SOURCE[0]}")
SILK_SIMULATOR_ROOT=$PWD
export NODE_PATH=$SILK_SIMULATOR_ROOT/system/silk/node_modules:$SILK_SIMULATOR_ROOT/system/node_modules
export PATH=$SILK_SIMULATOR_ROOT/system/silk/bin:$SILK_SIMULATOR_ROOT/system/bin:$PATH
echo Simulator root: $SILK_SIMULATOR_ROOT
