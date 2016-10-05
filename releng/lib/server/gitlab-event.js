/**
 * @flow
 */

import makeLog from 'silk-log';
import 'aws-sdk-promise';
import * as AWS from 'aws-sdk';
import Gitlab from 'gitlab';

type Pipeline = { status: string };
type Runner = Object;
type Instance = { InstanceId: string };
type Project = {
  id: string,
  name: string,
};
type Context = { project: Project };

const log = makeLog('gitlab-event');

const key = process.env.AWS_ACCESS_KEY_ID;
const secret = process.env.AWS_SECRET_ACCESS_KEY;

AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: new AWS.Credentials({
    accessKeyId: key,
    secretAccessKey: secret,
  }),
});

const ec2 = new AWS.EC2();

let gitlab;
if (process.env.GITLAB_TOKEN) {
  gitlab = new Gitlab({
    url: 'https://gitlab.com',
    token: process.env.GITLAB_TOKEN,
  });
} else {
  log.warn('GITLAB_TOKEN environment variable not defined.  Disabling gitlab integration');
}

function findProject(name: string): Promise<Project> {
  if (!gitlab) {
    return Promise.reject('No gitlab');
  }

  return new Promise((accept, reject) => {
    gitlab.projects.all(projects => {
      const project = projects.find(proj => proj.name === name);
      if (!project) {
        reject(new Error(`Project ${name} not found`));
        return;
      }
      accept(project);
    });
  });
}

function startInstances(): Promise<Array<Instance>> {
  const params = {
    ImageId: process.env.AMI_ID,
    InstanceType: process.env.INSTANCE_TYPE || 'c3.8xlarge',
    MinCount: 1,
    MaxCount: 1,
  };

  return ec2.runInstances(params)
    .promise()
    .then(response => response.data.Instances);
}

async function purgeInstances(project: Project): Promise<void> {
  // When there is no active pipelines anymore, shutdown instances.
  const pipelines = (await listPipelines(project))
    .filter(pipeline => pipeline.status === 'running' || pipeline.status === 'pending');
  if (pipelines.length === 0) {
    await stopInstances();
  }
}

async function stopInstances(): Promise<void> {
  // kill all running instances
  let response = await ec2.describeInstanceStatus({
    Filters: [{
      Name: 'instance-state-name',
      Values: ['running'],
    }],
  }).promise();

  let instanceIds = response.data.InstanceStatuses.map(instance => instance.InstanceId);
  log.info(`Stopping ${instanceIds.join(' ')}`);
  const params = {
    InstanceIds: instanceIds,
  };

  return ec2.terminateInstances(params).promise();
}

function listPipelines(project: Project): Promise<Array<Pipeline>> {
  if (!gitlab) {
    return Promise.reject('No gitlab');
  }

  return new Promise(accept => {
    gitlab.projects.pipelines.all(project.id, pipelines => {
      accept(pipelines);
    });
  });
}

function listRunners(project: Project): Promise<Array<Runner>> {
  if (!gitlab) {
    return Promise.reject('No gitlab');
  }

  return new Promise(accept => {
    gitlab.projects.runners.all(project.id, runners => {
      // we are only interested on active runners
      accept(runners.filter(runner => runner.active && !runner.is_shared));
    });
  });
}

export function getContext(): Promise<Context> {
  return findProject('silk-core').then(project => {
    // each hour check if there are possible dangling instances
    // and kill them
    setInterval(() => purgeInstances(project), 60 * 60 * 1000);

    return { project };
  });
}

export async function triggerBuild(
  json: Object,
  context: Context
): Promise<void> {
  if (!gitlab) {
    log.warn('Gitlab triggerBuild not available');
    return;
  }

  try {
    if (json.object_kind !== 'build') {
      return;
    }

    const buildId = json.build_id;

    switch (json.build_status) {
    case 'pending': {
      log.info(`Starting build ${buildId}`);

      let runners = await listRunners(context.project);
      if (runners.length === 0) {
        const instances = await startInstances(context.project);
        log.info(`Starting ${instances.map(instance => instance.InstanceId).join(' ')}`);
      }

      break;
    }

    case 'failed':
    case 'canceled':
    case 'success': {
      log.info(`Finishing build ${buildId}`);
      purgeInstances(context.project);
      break;
    }

    default:
      log.info(`Ignoring ${json.build_status}`);
    }
  } catch (err) {
    log.error(err.stack);
  }
}

