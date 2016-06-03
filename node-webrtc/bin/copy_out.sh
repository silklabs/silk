#!/bin/bash -ex

# location of the Release folder.
out=$1

if [[ -f $out/lib/node-webrtc.node ]]; then
  rm -f $out/node-webrtc.node
  cp $out/lib/node-webrtc.node $out
fi
