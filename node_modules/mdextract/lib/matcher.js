var extend = require('util')._extend;

/**
 * Regex-based parser tool.
 *
 *     rules = new Matcher({
 *       date: /\d\d\/\d\d:/
 *       transaction: '%{amount} - %{description}'
 *       amount: /\d+/
 *       description: /.*?/
 *     })
 * 
 * Iterating through lines (`#switch`):
 * 
 *     lines.forEach(function (line) {
 *       rules.switch(line, {
 *         transaction: function (m) {
 *           console.log("  Bought %s for %s", m.description, m.amount);
 *         },
 *         date: function (m) {
 *         }
 *       });
 *     });
 */

var Matcher = function (rules) {
  var options = rules.options;
  delete rules.options;

  this.rules = extend({}, Matcher.defaults.rules);
  this.rules = extend(this.rules, rules);

  this.options = extend({}, Matcher.defaults.options);
  this.options = extend(this.options, options);

  this._cache = {};
};

Matcher.defaults = {
  rules: {
    space: "\\s+"
  },
  options: {
    trim: false
  }
};

Matcher.prototype = {
  /**
   * Returns info on a given rule, including its regex
   */

  build: function (id) {
    var rule = this.partial(id);
    if (!rule) return;

    var re = rule.regexp;
    if (this.options.trim) re = "\\s*" + re + "\\s*";

    return {
      regexp: "^" + re + "$",
      indices: rule.indices
    };
  },

  partial: function (id) {
    if (this._cache[id]) return this._cache[id];

    var re;
    var matcher = this;
    var regexp = this.rules[id];
    if (!regexp) return;


    if (regexp.many)
      re = this.partialFromMany(regexp);
    else
      re = this.partialFromRegexp(regexp);

    this._cache[id] = re;
    return re;
  },

  /**
   * (Internal) Builds a partial regex.
   */

  partialFromRegexp: function (regexp) {
    var indices = [];
    var matcher = this;

    // Convert to string
    if (regexp.constructor === RegExp) regexp = regexp.source;

    // Whitespace
    regexp = regexp.replace(/ /g, this.rules.space);
    regexp = escapeGroups(regexp);

    // Recurse into nested partials
    regexp = regexp.replace(/%\{(?:([A-Za-z0-9]+):)?([A-Za-z0-9]+)\}/g, function (_, alias, id) {
      var r = matcher.partial(id);
      indices.push(alias || id);
      indices = indices.concat(r.indices);
      return "(" + r.regexp + ")";
    });

    return { regexp: regexp, indices: indices };
  },

  partialFromMany: function (def) {
    if (!def.separator) throw "No separator";

    var many = def.many;
    var sep = def.separator;
    if (sep.source) sep = sep.source;

    var regexp = this.partial(many).regexp;
    regexp = escapeGroups(regexp);
    regexp = regexp + "(?:" + sep + regexp + ")*";

    return { regexp: regexp, indices: [] };
  },

  /**
   * Match
   */

  match: function (id, str) {
    var matcher = this.build(id);
    if (!matcher) return;

    var m = str.match(matcher.regexp);
    if (!m) return false;

    var output = {};
    output[id] = m[0];

    if (matcher.indices.length > 0) {
      matcher.indices.forEach(function (name, i) { output[name] = m[i+1]; });
    }

    return output;
  },

  /**
   * Multi
   */

  multi: function (ids, str) {
    for (var i in ids) {
      var id = ids[i];
      var output = this.match(id, str);
      if (output) { 
        if (typeof output === 'object') {
          output.rule = id;
          return output;
        } else {
          return {
            value: output,
            rule: id
          };
        }
      }
    }

    return false;
  },

  /**
   * Switch
   */
  
  switch: function (str, callbacks) {
    var ids = Object.keys(callbacks);
    var m = this.multi(ids, str);

    if (!m) return callbacks.else ? callbacks.else(m) : false;

    return callbacks[m.rule](m);
  }
};

/**
 * Change unescaped parentheses ("(hello) => (?:hello)")
 */

function escapeGroups (regexp) {
  return regexp.replace(/^\(|[^\\]\((?!\?:)/g, function (match) { return match + "?:"; });
}

module.exports = Matcher;
