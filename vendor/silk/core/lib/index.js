/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// At the time of this writing, a `debugger;` statement is not triggered until
// the first callback is invoked for an unknown reason. This issue is avoided by
// using a setTimeout() to launch the main program
setTimeout(() => require('./main'), 0);
