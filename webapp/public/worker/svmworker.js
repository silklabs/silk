'use strict';

importScripts('svm.js');

let workerId = -1;

function log(...args) {
  console.log(`[svmworker:${workerId}]`, ...args);
}

function send(cmd, body) {
  postMessage({ cmd, body, workerId });
}

log('Loaded');

onmessage = (e) => {
  let { cmd, body } = e.data;
  log('Received message with command', cmd);
  switch (cmd) {
  case 'init': {
    workerId = body.id;
    log(`Initialized with id ${workerId}`);
    return;
  }
  case 'svm-train': {
    return trainSVM(body);
  }
  default: {
    throw new Error(`Unknown command ${cmd}`);
  }
  }
};

function trainSVM(params) {
  let { jobId, data, labels, options } = params;      
  let svm = new svmjs.SVM();
  let start = Date.now();
  svm.train(data, labels, options);
  let trainSecs = (Date.now() - start) / 1000;
  log(`  finished in ${trainSecs} seconds`);
  send('svm-trained', { jobId, svmJSON: svm.toJSON(), trainSecs });
}
