/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// TODO: Remove "legacy" webapp as soon as possible
if (document.title === 'Silk Diag') {
  require('./legacy/diag');
} else if (document.title === 'Silk Server') {
  require('./legacy/silk');
}
