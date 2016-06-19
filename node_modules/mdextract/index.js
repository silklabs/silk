/* jshint boss: true, maxlen: 80 */

var Matcher = require('./lib/matcher');
var extend = require('util')._extend;

/***
 * mdextract : mdextract(src, options)
 * Extracts source documents.
 *
 *     var mdextract = require('mdextract');
 *     var doc = mdextract(source);
 *
 *     console.log(doc.toMarkdown());
 *
 * Returns a [Document] instance.
 */

var mdextract = module.exports = function (src, options) {
  var doc = new Document(options);
  doc.parse(src);
  return doc;
};

var rules = new Matcher({
  space: "\\s",
  string: '.*?',
  eol: '(\\s*%{endcomment})?\\s*',
  h2: '\\s*%{h2prefix}\\s*%{doc:string}%{eol}',
  h3: '\\s*%{h3prefix}\\s*%{doc:string}%{eol}',
  doc: '\\s*%{docprefix}\\s?%{doc:string}%{eol}',
  blank: '%{eol}',
  h2prefix: '/\\*\\*\\*',
  h3prefix: '/\\*\\*',
  docprefix: '\\*',
  endcomment: '\\*/',
});

/***
 * Document : new Document(options)
 * A document represents a bunch of source code.
 * A [mdextract] call will return a *Document* instance.
 *
 *     var mdextract = require('mdextract');
 *     var doc = mdextract(source);
 *
 * Options available:
 *
 * ~ forceHeadings (boolean): If true, sections without headings will be
 *   ignored.
 * ~ lang (string): Language to be used. Defaults to `"js"`.
 *
 * When invoking mdextract from the command line with a `--json` option, the
 * result is a JSONified Document instance.
 */

var Document = function (options) {
  /**
   * options:
   * The available options as received through the [Document] constructor.
   * Example:
   *
   *     doc = mdextract(source);
   *
   *     doc.options
   *     => { lang: "js" }
   */
  this.options = options || {};
  this.options.lang = this.options.lang || 'js';

  /** 
   * blocks:
   * The list of section blocks as parsed away from the source. This is an
   * array of [Block] instances.
   * 
   *     doc = mdextract(source);
   *
   *     doc.blocks
   *     => [
   *       { internal: false,
   *         docline: 55,
   *         codeline: 66,
   *         level: 3,
   *         heading: "A heading",
   *         body: "This is the body in *markdown* format." },
   *       { ... },
   *       ...
   *     ]
   */

  this.blocks = [];
};

Document.prototype = {
  /**
   * parse : .parse(options)
   * (internal) parses the document and saves its JSON tree to [blocks].
   */

  parse: function (src, fname) {
    var ctx = new Context(this, src, fname);
    ctx.process();
    this.blocks = this.blocks.concat(ctx.blocks);
  },

  /**
   * toMarkdown : .toMarkdown(options)
   * Converts the document to markdown. Returns the Markdown string.
   *
   *     doc = mdextract(source);
   *     console.log(doc.toMarkdown());
   *     => "## heading\nthis is stuff extracted from your source.\n..."
   *
   * Available options are:
   *
   * ~ showInternal (boolean): renders internal/private API if true.
   */

  toMarkdown: function (options) {
    var lines = [];

    this.blocks.forEach(function (block) {
      // skip internal blocks
      if (block.internal && !(options && options.showInternal)) return;

      var prefix = Array(block.level+1).join('#');

      if (block.heading) lines.push(prefix + ' ' + block.heading);
      if (block.subheading) lines.push('> `' + block.subheading + '`');
      if (block.heading || block.subheading) lines.push('');
      lines.push(block.body);
      lines.push('');
    });

    return lines.join('\n').trim();
  },

  /**
   * processText : processText(text, block)
   * (internal) Propagates `text` into the given `block`.
   */

  processText: function (text, block) {
    var lines = text.split("\n");
    var m;
    var bodylines = [];

    lines.forEach(function (line, i) {
      if (i === 0) {
        if (m = line.match(/^(.*?):$/)) {
          block.heading = m[1];
        }
        else if (m = line.match(/^(.*?) : (.*?)$/)) {
          block.heading = m[1];
          block.subheading = m[2];
        }
        else if (m = line.match(/^(.*?):(?: (.*?))?$/)) {
          block.heading = m[1];
          bodylines.push(m[2]);
        } else {
          bodylines.push(line);
        }
      } else {
        bodylines.push(line);
      }
    });

    var unpackCode = require('./lib/transforms').unpackCode;
    var expandDefLists = require('./lib/transforms').expandDefLists;

    block.body = bodylines.join("\n");
    block.body = unpackCode(block.body, { lang: this.options.lang });
    block.body = expandDefLists(block.body);

    if (m = block.body.match(/^\((?:internal|private)\)\s*((?:.|\s)+)$/i)) {
      block.body = m[1];
      block.internal = true;
    }
  }
};

/***
 * Context: (internal) a parsing context.
 */

function Context(doc, src, fname) {
  this.doc = doc;
  this.src = src;
  this.fname = fname;
  this.blocks = [];
  this.block = undefined;
}

Context.prototype = {
  process: function () {
    var ctx = this;

    eachLine(ctx.src, function (line, i) {
      rules.switch(line, {
        h2: function (m) {
          ctx.flush();
          ctx.block = ctx.newBlock(2, m.doc, i+1);
        },
        h3: function (m) {
          ctx.flush();
          ctx.block = ctx.newBlock(3, m.doc, i+1);
        },
        blank: function() {
          ctx.flush();
        },
        doc: function (m) {
          if (!ctx.block) return;
          ctx.block.lines.push(m.doc);
        },
        else: function () {
          var block = ctx.lastBlock();
          if (block) block.codeline = i+1;
        }
      });
    });

    ctx.flush();
  },

  /** newBlock: (internal) Creates a new block. */
  newBlock: function (level, line, docline) {
    return new Block({
      level: level,
      lines: [line],
      docline: docline,
      filename: this.fname,
      internal: false
    });
  },

  /** lastBlock: (internal) Returns the last defined block. */
  lastBlock: function () {
    return this.blocks[this.blocks.length-1];
  },

  /**
   * warn : warn(text, line)
   * (internal) Issues a warning
   */

  warn: function (text, line) {
    console.warn("%s:%s: warning: %s", this.fname, line, text);
  },

  /** flush: (internal) finalizes the last block defined. */
  flush: function () {
    if (!this.block) return;

    if (!this.block.lines) {
      this.warn("no lines found", block.docline);
      this.block = null;
      return;
    }

    this.block.lines = this.block.lines.join("\n").trim();
    this.doc.processText(this.block.lines, this.block);
    delete this.block.lines;

    if (this.doc.options.forceHeadings && this.block.heading) {
      this.warn("no heading found", this.block.docline);
      this.block = null;
      return;
    }

    this.blocks.push(this.block);
    this.block = null;
  }
};

/***
 * Block:
 * A section block. Options:
 *
 * ~ docline (number): line number where the documentation starts
 * ~ codeline (number): line number where code starts
 * ~ level (number): heading level
 * ~ heading (string): heading text
 * ~ subheading (string, optional): optional subheading text
 * ~ body (string): body text
 */

function Block (data) {
  extend(this, data);
}

/***
 * Helpers:
 * (internal) Helpers.
 */

/** eachline: (internal) Helper for iterating through each line. */
function eachLine (src, fn) {
  src.split('\n').forEach(fn);
}

/** slugify: (internal) slugger */
function slugify (str) {
  return str.match(/[A-Za-z0-9]+/g).join('_');
}

mdextract.Document = Document;
