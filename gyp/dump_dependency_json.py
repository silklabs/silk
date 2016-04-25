# Copyright (c) 2012 Google Inc. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import collections
import os
import gyp
import gyp.common
import gyp.msvs_emulation
import json
import sys

generator_supports_multiple_toolsets = True

generator_wants_static_library_dependencies_adjusted = False

generator_filelist_paths = {
}

generator_default_variables = {
}
for dirname in ['INTERMEDIATE_DIR', 'SHARED_INTERMEDIATE_DIR', 'PRODUCT_DIR',
                'LIB_DIR', 'SHARED_LIB_DIR']:
  # Some gyp steps fail if these are empty(!).
  generator_default_variables[dirname] = 'dir'
for unused in ['RULE_INPUT_PATH', 'RULE_INPUT_ROOT', 'RULE_INPUT_NAME',
               'RULE_INPUT_DIRNAME', 'RULE_INPUT_EXT',
               'EXECUTABLE_PREFIX', 'EXECUTABLE_SUFFIX',
               'STATIC_LIB_PREFIX', 'STATIC_LIB_SUFFIX',
               'SHARED_LIB_PREFIX', 'SHARED_LIB_SUFFIX',
               'CONFIGURATION_NAME']:
  generator_default_variables[unused] = ''


def CalculateVariables(default_variables, params):
  generator_flags = params.get('generator_flags', {})
  for key, val in generator_flags.items():
    default_variables.setdefault(key, val)
  default_variables.setdefault('OS', gyp.common.GetFlavor(params))

  flavor = gyp.common.GetFlavor(params)
  if flavor =='win':
    # Copy additional generator configuration data from VS, which is shared
    # by the Windows Ninja generator.
    import gyp.generator.msvs as msvs_generator
    generator_additional_non_configuration_keys = getattr(msvs_generator,
        'generator_additional_non_configuration_keys', [])
    generator_additional_path_sections = getattr(msvs_generator,
        'generator_additional_path_sections', [])

    gyp.msvs_emulation.CalculateCommonVariables(default_variables, params)


# Garbage to make gyp happy...
def CalculateGeneratorInputInfo(params):
  """Calculate the generator specific info that gets fed to input (called by
  gyp)."""
  generator_flags = params.get('generator_flags', {})
  if generator_flags.get('adjust_static_libraries', False):
    global generator_wants_static_library_dependencies_adjusted
    generator_wants_static_library_dependencies_adjusted = True

  toplevel = params['options'].toplevel_dir
  generator_dir = os.path.relpath(params['options'].generator_output or '.')
  # output_dir: relative path from generator_dir to the build directory.
  output_dir = generator_flags.get('output_dir', 'out')
  qualified_out_dir = os.path.normpath(os.path.join(
      toplevel, generator_dir, output_dir, 'gypfiles'))
  global generator_filelist_paths
  generator_filelist_paths = {
      'toplevel': toplevel,
      'qualified_out_dir': qualified_out_dir,
  }

def GenerateOutput(target_list, target_dicts, data, params):
  sources = set()

  if params['options'].includes:
    for include in params['options'].includes:
      sources.add(os.path.abspath(include))

  for qualified_target in target_list:
    [input_file] = gyp.common.ParseQualifiedTarget(qualified_target)[0:1]
    root = os.path.dirname(input_file)
    spec = target_dicts[qualified_target]

    # Add the gyp file itself.
    sources.add(os.path.abspath(input_file))

    # Add any includes the gyp file makes...
    for include in data[input_file].get('included_files', []):
      sources.add(os.path.abspath(os.path.join(root, include)))

    if 'sources' not in spec:
      continue

    for source in spec['sources']:
      sources.add(os.path.abspath(os.path.join(root, source)))

  try:
    filepath = params['generator_flags']['output_dir']
  except KeyError:
    filepath = '.'
  filename = os.path.join(filepath, 'files.json')
  f = open(filename, 'w')
  json.dump(list(sources), f)
  f.close()
  print 'Wrote json to %s.' % filename
