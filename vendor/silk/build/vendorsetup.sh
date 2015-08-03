export LOCKED_NODE_MODULES=$(readlink -f $(dirname $BASH_SOURCE)/locked_node_modules/node_modules)
export FETCH_LOCKED_NODE_MODULES=$(readlink -f $(dirname $BASH_SOURCE)/locked_node_modules/fetch.sh)
