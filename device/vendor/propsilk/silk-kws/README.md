#### How to run keyword spotting on the host

```
./tools/runKws.js
```

NOTE: This tools doesn't support voice activity detction so `persist.silk.kws.vad.enabled`
should be set to `false` before running this tool.

#### Prerequisites
Make sure to run the following comamnd from the `silk-core` first to install caffe on the host.
```
cd silk-core
./install.sh
```
