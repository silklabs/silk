/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

module.exports = {
  /**
   * Normalize a UUID into a form suitable for comparing with other
   * normalized UUIDs.
   */
  normUuid: function(u) {
    return u.replace(/[-]+/g, '').toLowerCase();
  },
};
