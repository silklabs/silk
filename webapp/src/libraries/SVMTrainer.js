import createLog from 'silk-log';
import invariant from 'assert';
import svmjs from 'svm';

const log = createLog('SVMTrainer');

const NUM_WORKERS = 6;

function checkProps(obj, props) {
  for (let prop of props) {
    if (!(prop in obj)) {
      log.error(`Missing property ${prop}`);
      return false;
    }
  }
  return true;
}

function getTestClass(testName) {
  return testName.split('-')[0];
}

class SVMTrainer {
  jobQ = [ ];
  nrJobs = 0;
  resolve;
  reject;
  runningJobs = { };            // id -> job
  statusUpdateInterval;
  svmCfg;
  svmJSON = null;
  trainCfg;
  trainingReport = '';
  trainingStart;
  workers = [ ];

  constructor(svmConfig, trainingConfig) {
    this.svmCfg = svmConfig;
    this.trainCfg = trainingConfig;
    this.trainingReport = ` Training ${this.svmCfg.soundClass}
--------------------------------------------------`;
    for (let i = 0; i < NUM_WORKERS; ++i) {
      let worker = new Worker('worker/svmworker.js');
      worker.onmessage = this.onWorkerMessage;
      worker.onerror = this.onWorkerError;
      worker.state = 'idle';
      worker.postMessage({ cmd: 'init', body: { id: i }});
      this.workers.push(worker);
    }
  }

  run(trainingData, trainingLabels, validationData, validationLabels) {
    this.statusUpdateInterval = setInterval(this.onUpdateStatus, 5000);

    this.trainingStart = Date.now();
    let optionsList = this._fullTraining ?
          [ this.trainCfg.options ] : this.trainCfg.optionsList;
    this.jobQ = optionsList.map((options, idx) => ({
      id: idx,
      options,
      run1: {
        state: 'pending',
        trainingData, trainingLabels, validationData, validationLabels,
        svmJSON: null, trainSecs: -1,
      },
      run2: {
        state: 'pending',
        trainingData: validationData, trainingLabels: validationLabels,
        validationData: trainingData, validationLabels: trainingLabels,
        svmJSON: null, trainSecs: -1,
      },
    }));
    this.nrJobs = this.jobQ.length;
    log.info(`Prepared to run ${this.nrJobs} '${this.trainCfg.mode}' training/validation jobs across ${this.workers.length} workers`);

    if (this._fullTraining) {
      // Hack; mark the single job as running and half done to avoid
      // the second, reflexive, training run.
      let job = this.jobQ.shift();
      job.run1.state = 'done';
      this.runningJobs[job.id] = job;
    }
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.scheduleWork();
    });
  }

  finish() {
    clearInterval(this.statusUpdateInterval);
    let totalSecs = (Date.now() - this.trainingStart) / 1000.0;
    log.info('Finished all training/validation jobs');
    this.resolve({
      report: this.trainingReport,
      svmJSON: this.svmJSON,
      totalSecs,
    });
  }

  scheduleWork() {
    if (this.jobQ.length === 0 && Object.keys(this.runningJobs).length === 0) {
      return this.finish();
    }
    let worker = this.findIdleWorker();
    if (!worker) {
      log.info('No idle workers, awaiting already-running jobs.');
      return undefined;
    }
    // Look at the running jobs to see if any of them have pending
    // work.  This prefers completing individual jobs as soon as
    // possible over scheduling them "fairly".
    for (let jobId in this.runningJobs) {
      let job = this.runningJobs[jobId];
      // We always start `run1` first below, so it can't be pending
      // here.
      invariant(job.run1.state !== 'pending');
      if (job.run2.state === 'pending') {
        this.startJobRun(job, 'run2', worker);

        return this.scheduleWork();
      }
    }
    log.info('No already-running jobs with unscheduled work.');
    if (this.jobQ.length === 0) {
      console.log('No more queued jobs, awaiting already-running jobs.');
      return undefined;
    }
    let job = this.jobQ.shift();
    this.runningJobs[job.id] = job;
    this.startJobRun(job, 'run1', worker);

    return this.scheduleWork();
  }

  startJobRun(job, runId, worker) {
    let options = job.options;
    let run = job[runId];
    invariant(run.state === 'pending');
    let jobRunId = { job: job.id, run: runId };
    let { trainingData, trainingLabels } = run;

    log.info(`Starting ${job.id}:${runId} on ${trainingData.length} points at ${new Date()} ... this will take a while`);

    run.state = 'running';
    worker.state = 'training';
    worker.postMessage({
      cmd: 'svm-train',
      body: {
        jobId: jobRunId,
        data: trainingData,
        labels: trainingLabels.map(this.labelToSVMClass),
        options,
      },
    });
  }

  findIdleWorker() {
    for (let worker of this.workers) {
      if (worker.state === 'idle') {
        return worker;
      }
    }
    return null;
  }

  labelToSVMClass = (label) => (
    getTestClass(label) === this.svmCfg.soundClass ? 1 : -1
  );

  maybeProcessFinishedJobs() {
    let finishedJobIds = Object.keys(this.runningJobs).filter((jobId) => {
      let job = this.runningJobs[jobId];
      return job.run1.state === 'done' && job.run2.state === 'done';
    });
    finishedJobIds.forEach((id) => {
      this.reportFinishedJob(this.runningJobs[id]);
      delete this.runningJobs[id];
    });
  }

  onUpdateStatus = () => {
    let elapsed = (Date.now() - this.trainingStart) / 1000;
    log.info(`Still doing SVM work: ${Object.keys(this.runningJobs).length} running jobs, ${this.jobQ.length} pending, ${elapsed}s elapsed time`);
  };

  onWorkerMessage = (e) => {
    let { cmd, body, workerId } = e.data;
    if (cmd !== 'svm-trained') {
      this.reject(`Unexpected worker reply ${cmd}`);
      return;
    }
    let { jobId, svmJSON, trainSecs } = body;
    let job = this.runningJobs[jobId.job];
    let run = job[jobId.run];
    let worker = this.workers[workerId];
    run.state = 'done';
    run.svmJSON = svmJSON;
    run.trainSecs = trainSecs;
    worker.state = 'idle';

    log.info(`Finished job run ${jobId.job}:${jobId.run} in ${trainSecs}s`);
    this.maybeProcessFinishedJobs();

    this.scheduleWork();
  };

  onWorkerError = (e) => {
    this.reject(`Worker error: ${e}`);
  };

  report(msg) {
    this.trainingReport += msg;
    this.trainingReport += '\n';
    log.info(msg);
  }

  reportFinishedJob(job) {
    let options = job.options;
    this.report(`\nParams (${job.id + 1}/${this.nrJobs}):
  ${JSON.stringify(options)}`);
    if (this._fullTraining) {
      // We're done ... run1 was skipped and would have been identical
      // to run2.  Since we only trained one SVM, the resulting model
      // is meaningful for the user so we'll return it when we
      // `resolve()`.
      this.reportJobRun(job, 'run2');
      this.svmJSON = job.run2.svmJSON;
      return;
    }
    this.reportJobRun(job, 'run1');
    this.report('  --------------------');
    this.reportJobRun(job, 'run2');
  }

  reportJobRun(job, runId) {
    let run = job[runId];
    invariant(run.state === 'done');

    let { validationData, validationLabels, trainSecs } = run;
    let svm = new svmjs.SVM();
    svm.fromJSON(run.svmJSON);

    log.info(`Generating predictions on ${validationData.length} points ...`);
    let start = Date.now();
    let predictions = svm.predict(validationData);
    let predictSecs = (Date.now() - start) / 1000;
    log.info(`  finished in ${predictSecs} seconds`);

    let nrTests = predictions.length;
    let nrEvents = 0;
    let nrNonEvents = 0;
    let miss = [ ];
    let falseAccept = [ ];
    for (let i = 0; i < validationLabels.length; ++i) {
      let label = validationLabels[i];
      let [ expected, actual ] = [ this.labelToSVMClass(label), predictions[i] ];
      if (expected === 1) {
        nrEvents++;
        if (actual !== expected) {
          miss.push(label);
        }
        continue;
      }
      if (expected === -1) {
        nrNonEvents++;
        if (actual !== expected) {
          falseAccept.push(label);
        }
        continue;
      }
      console.log('WTF', expected, actual);
      throw new Error('WTF');
    }
    let msPerTest = 1000.0 * predictSecs / nrTests;
    this.report(`${runId} validation:`);
    this.report(`  ${miss.length}/${nrEvents} events missed`);
    this.report(`  ${falseAccept.length}/${nrNonEvents} non-events falsely accepted`);
    this.report(`  ${trainSecs}s to train and ${predictSecs}s for ${nrTests} predictions (${msPerTest.toFixed(1)}ms each)`);
    if (this.trainCfg.reportFailedTests) {
      this.report(`    misses: ${miss}`);
      this.report(`    false-accepts: ${falseAccept}`);
    }
  }

  get _fullTraining() {
    return this.trainCfg.mode === 'full';
  }
}

const requiredParams = [
  'trainingData', 'trainingLabels', 'validationData', 'validationLabels',
  'trainingConfig',
];
const requiredTrainingParams = [
  'svmConfig', 'mode',
];
export function trainSVM(params) {
  if (!checkProps(params, requiredParams)) {
    return Promise.reject(`Missing required param`);
  }
  let { trainingData, trainingLabels, validationData, validationLabels,
        trainingConfig } = params;
  if (!checkProps(trainingConfig, requiredTrainingParams)) {
    return Promise.reject(`Missing required param`);
  }
  if (trainingConfig.mode === 'full' && !('options' in trainingConfig)) {
    return Promise.reject(`'options' param required for 'full' training`);
  }
  if (trainingConfig.mode !== 'full' && !('optionsList' in trainingConfig)) {
    return Promise.reject(`'optionsList' param required for 'cross-validate' training`);
  }
  let { svmConfig } = trainingConfig;
  let trainer = new SVMTrainer(svmConfig, trainingConfig);
  return trainer.run(trainingData, trainingLabels,
                     validationData, validationLabels);
}
