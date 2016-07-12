/**
 * @flow
 */

import createLog from 'silk-log';
import fs from 'fs';
import path from 'path';

import * as Writer from './file_writer';

import SegmentProviderFiles from './segment_provider_files';

const log = createLog('m4s-combinator');

export function combine(
  inputFiles: Array<string>,
  outputFile: string
): void {
  log.debug(`Combining files to '${outputFile}'`);
  const provider = new SegmentProviderFiles(inputFiles);
  Writer.startConcatenateWriter(provider, outputFile);
}

export function sequence(
  inputFiles: Array<string>,
  outputDir: string
): void {
  log.debug(`Sequencing files to '${outputDir}'`);
  const provider = new SegmentProviderFiles(inputFiles);
  Writer.startSegmentsWriter(provider, outputDir);
}

function usage(): void {
  log.info(`Usage:\n` +
           `${process.argv[0]} ${path.basename(process.argv[1])} ` +
           `combine <inputDir> <outputFile>\n` +
           `${process.argv[0]} ${path.basename(process.argv[1])} ` +
           `sequence <inputDir> <outputDir>\n`);
}

function main(): void {
  const cwd = process.cwd();
  let [/* node */, /* script */, mode, inputDir, output ] = process.argv;

  if (!mode) {
    usage();
    throw new Error(`Missing mode`);
  }

  if (mode !== `combine` && mode !== `sequence`) {
    usage();
    throw new Error(`Invalid mode`);
  }

  if (!inputDir) {
    usage();
    throw new Error(`Missing input directory`);
  }

  if (!output) {
    usage();
    switch (mode) {
    case `combine`:
      throw new Error(`Missing output file`);
    case `sequence`:
      throw new Error(`Missing output directory`);
    default:
      throw new Error(`Unhandled mode`);
    }
  }

  inputDir = path.resolve(cwd, inputDir);

  try {
    fs.statSync(inputDir);
  } catch (err) {
    if (err.code !== `ENOENT`) {
      throw err;
    }
    throw new Error(`Input directory '${inputDir}' does not exist`);
  }

  const outputPath =
    (mode === `combine` || mode === `sequence`) ?
    path.resolve(cwd, output) :
    ``;

  switch (mode) {
  case `combine`: {
    let stats;
    try {
      stats = fs.statSync(outputPath);
    } catch (err) {
      if (err.code !== `ENOENT`) {
        throw err;
      }
    }
    if (stats) {
      if (stats.isDirectory()) {
        throw new Error(`'${outputPath}' is a directory`);
      }
      throw new Error(`Output file '${outputPath}' already exists`);
    }
  } break;

  case `sequence`: {
    let stats;
    try {
      stats = fs.statSync(outputPath);
    } catch (err) {
      if (err.code === `ENOENT`) {
        throw new Error(`Output directory '${outputPath}' does not exist`);
      }
      throw err;
    }
    if (!stats.isDirectory()) {
      throw new Error(`'${outputPath}' is a not a directory`);
    }
    if (fs.readdirSync(outputPath).some(name => name.startsWith(`seg-`))) {
      throw new Error(`'${outputPath}' is a not empty`);
    }
  } break;

  default:
    throw new Error(`Unhandled mode`);
  }

  let inputFiles;
  try {
    inputFiles = fs.readdirSync(inputDir);
  } catch (err) {
    if (err.code !== `ENOTDIR`) {
      throw err;
    }
    throw new Error(`Input directory '${inputDir}' is not a directory`);
  }

  inputFiles = inputFiles.filter((filename) => {
    const stats = fs.statSync(path.join(inputDir, filename));
    if (stats.isDirectory()) {
      log.warn(`Skipping directory '${filename}'`);
      return false;
    }
    if (!stats.isFile()) {
      log.warn(`Skipping non-file '${filename}'`);
      return false;
    }
    if (path.extname(filename) !== `.m4s`) {
      log.warn(`Skipping '${filename}'`);
      return false;
    }
    return true;
  });

  if (!inputFiles.length) {
    throw new Error(`No files to combine`);
  }

  inputFiles.sort();
  inputFiles = inputFiles.map((filename) => path.join(inputDir, filename));

  switch (mode) {
  case `combine`:
    return combine(inputFiles, outputPath);

  case `sequence`:
    return sequence(inputFiles, outputPath);

  default:
    throw new Error(`Unhandled mode`);
  }
}

try {
  main();
} catch (err) {
  log.error(err.stack);
  process.exit(1); // eslint-disable-line no-process-exit
}
