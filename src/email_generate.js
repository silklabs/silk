/**
 * Email asset generation helper... Generally email providers have super
 * variable support for CSS so we first inline the CSS then compile the html
 * into a hogan template (mustache) which can be saved and run quickly.
 */

import hogan from 'hogan.js';
import cssInline from 'inline-css';
import fs from 'mz/fs';
import path from 'path';
import denodeify from 'denodeify';
import eventToPromise from 'event-to-promise';

// XXX: Lame but css-inline expects an http server?
import { Server as Static } from 'node-static';
import http from 'http';

let log = require('./server/log')('email_generate');

const SRC = path.join(__dirname, '../assets/emails');
const DEST = path.join(__dirname, '/server/emails');

const inline = denodeify(cssInline);

function hoganModule(string) {
  // Hack to create hogan.js functions.
  return `

import { Template } from 'hogan.js';

module.exports = new Template(${string});

`.trim();
}

/**
 * Inline and compile email assets in parallel.
 */
async function inlineAssets(baseUrl) {
  // Only inline email assets.
  let inputs = (await fs.readdir(SRC)).filter(path => {
    return path.indexOf('.html') !== -1;
  });

  // Ensure destination exists...
  if (!await fs.exists(DEST)) {
    await fs.mkdir(DEST);
  }

  // Run all operations in parallel.
  await Promise.all(inputs.map(async (file) => {
    let name = file.split('.')[0];
    let source = path.join(SRC, file);
    let dest = path.join(DEST, name + '.js');

    log.info('compile:', source, dest);
    let content = await fs.readFile(source);

    // Strip all external css file references for maximum email compat.
    let inlined = await inline(content, {
      url: baseUrl
    });

    // Inline to a hogan module so server side can easily render the contents.
    let compiled = hogan.compile(inlined, { asString: true });
    let module = hoganModule(compiled);
    await fs.writeFile(dest, module);
  }));
}

export default async function main() {
  var fileServer = new Static(SRC);
  let server = http.createServer((req, res) => {
    req.addListener('end', function () {
      fileServer.serve(req, res);
    }).resume();
  }).listen(0);

  await eventToPromise(server, 'listening');
  let url = `http://localhost:${server.address().port}/`;
  log.info('Starting email build server', url);

  await inlineAssets(url);
  server.close();
}

if (process.mainModule === module) {
  console.log('Building email templates...');
  main().catch(err => {
    setTimeout(() => {
      throw err;
    });
  });
}

