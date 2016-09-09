/**
 * @noflow
 */

import fs from 'fs';
import path from 'path';

import * as github from '../lib/github';

github.readFileAtCommit = async function(owner, repo, sha, filename) {
  try {
    let mockfile = path.join(__dirname, 'mock-repo', filename);
    return fs.readFileSync(mockfile, {encoding: 'utf-8'});
  } catch (ex) {
    return null;
  }
};

github.hasOrgMembership = function(org, name) {
  return Promise.resolve(name === 'silk-stooge');
};
