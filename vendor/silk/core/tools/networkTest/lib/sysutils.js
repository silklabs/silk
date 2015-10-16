/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/**
 * Copyright (c) 2015 Silk Labs, Inc.
 * All Rights Reserved.
 * Confidential and Proprietary - Silk Labs, Inc.
 */

export function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function processthrow(e) {
  console.error(e.stack);
  process.exit(1);
}

