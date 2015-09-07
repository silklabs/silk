/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

// TODO: This is a terrible hack.  Refactor the codes to remove it!
if (document.title === 'Silk Diag') {
  require('./diag');
} else {
  require('./silk');
}
