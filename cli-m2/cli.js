/**
 * @flow
 */

/* eslint no-console: 0, no-process-exit: 0 */

import * as childProcess from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import createLog from 'silk-log';
import * as tmp from 'tmp';

const log = createLog('silk-cli-plugin-m2');

// ROOT is the root of the repository (silk-core).
const ROOT = path.resolve(__dirname, '..');

// The default port that Sonatype Nexus listens on.
const NEXUS_PORT = 8081;

// 8081 is usually taken by the React Native packager, so let's use 8082
const LOCAL_PORT = 8082;

const NEXUS_STATUS_URL =
  `http://localhost:${LOCAL_PORT}/nexus/service/local/status`;
const NEXUS_REPO_URL =
  `http://localhost:${LOCAL_PORT}/nexus/content/repositories/jcenter/`;

const DOCKER_CONTAINER_NAME = 'silk-m2-nexus';
const DOCKER_IMAGE = 'sonatype/nexus';

const NEXUS_XML_LOCAL_PATH = path.join(__dirname, 'nexus.xml');
const NEXUS_XML_CONTAINER_PATH = '/sonatype-work/conf/nexus.xml';

const NEXUS_MAX_TIMEOUT_MS = 60000;

const JCENTER_STORAGE_PATH = '/sonatype-work/storage/jcenter';

/**
 * Run a shell command synchronously.
 */
function run(
  cmd: string | Array<string>,
  options?: child_process$execSyncOpts
): string | Buffer {
  if (Array.isArray(cmd)) {
    cmd = cmd.join(' ');
  }
  log.debug('>', cmd);
  return childProcess.execSync(cmd, options);
}

/**
 * Wait for the Nexus HTTP service to be up.
 */
function waitForNexus(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function testStatus() {
      if ((Date.now() - startTime) > NEXUS_MAX_TIMEOUT_MS) {
        reject(new Error('Nexus is taking too long to start!'));
        return;
      }

      const request = http.get(NEXUS_STATUS_URL, (response) => {
        request.removeAllListeners();
        log.debug(`${NEXUS_STATUS_URL}: HTTP ${response.statusCode}`);
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        reject(new Error(`Nexus responded with ${response.statusCode}`));
      });
      request.on('error', (error) => {
        log.debug(`${NEXUS_STATUS_URL}: ${error.message}`);
        setTimeout(testStatus, 1000);
      });
    }
    testStatus();
  });
}

export const remoteUpdate = {
  name: 'm2-remote-update',
  help: `
    Update the local m2-remote repository with dependencies pulled
    down from a Gradle build.
  `,
  arguments: [],
  main: async () => {
    if (!fs.existsSync('build.gradle')) {
      console.error(`
        This command must be run from an Android app project directory
        containing build.gradle!
      `);
      process.exit(1);
    }

    try {
      run('which docker');
    } catch (ex) {
      console.error(`
        This command requires the 'docker' command line tool to be
        installed and in the search path.`
      );
      process.exit(1);
    }

    console.log('Setting up local Nexus proxy repository in docker container.');
    run([
      'docker', 'run', '-d',
       '-p', `${LOCAL_PORT}:${NEXUS_PORT}`,
      '--name', DOCKER_CONTAINER_NAME,
      DOCKER_IMAGE
    ]);

    console.log('Waiting for Nexus container to be ready...')
    await waitForNexus();

    // Kill the container again so we can add the JCenter proxy repo
    // to the configuration. The default Nexus configuration only
    // proxies Maven Central, but we need stuff that's only in JCenter.
    console.log('Configuring Nexus...');
    run(`docker stop ${DOCKER_CONTAINER_NAME}`);

    // Copy the new configuration file with the JCenter proxy repo in
    // it to the container.
    run([
      'docker', 'cp',
      NEXUS_XML_LOCAL_PATH,
      `${DOCKER_CONTAINER_NAME}:${NEXUS_XML_CONTAINER_PATH}`,
    ]);

    console.log('Starting Nexus...');
    run(`docker start ${DOCKER_CONTAINER_NAME}`);

    await waitForNexus();
    console.log('Nexus is running.');

    console.log('Kicking off gradle build...');
    run([
      path.join(ROOT, 'gradle', 'gradlew'),
      'assembleDebug',
      '--refresh-dependencies',
      '--console=plain',
    ], {
      env: {
        ...process.env,
        MAVEN_REMOTE_REPO: NEXUS_REPO_URL,
      },
    });

    console.log('Shutting down Nexus docker container...');
    run(`docker stop ${DOCKER_CONTAINER_NAME}`);

    console.log('Retrieving Maven 2 repository from docker container...');
    const tempDir = tmp.dirSync().name;
    run([
      'docker', 'cp',
      `${DOCKER_CONTAINER_NAME}:${JCENTER_STORAGE_PATH}`,
      path.join(tempDir, 'm2-remote'),
    ]);

    console.log('Removing docker container...');
    run(`docker rm ${DOCKER_CONTAINER_NAME}`);

    console.log('Updating local m2-remote tree...');
    run([
      'rsync', '-a',
      '--exclude', '.index',
      '--exclude', '.nexus',
      path.join(tempDir, 'm2-remote'),
      ROOT,
    ]);
  },
};
