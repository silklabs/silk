/**
 * unpackCode : unpackCode(code, options)
 * puts code blocks from string `code` into fences. Works with 2-space and
 * 4-space indents. Returns a string.
 *
 * ~ lang (string): language for the codeblock
 *
 *     unpackCode(code, { lang: 'js' });
 */

exports.unpackCode = function(str, options) {
  var output = [];
  var last;

  eachBlock(str, function (block) {
    var m = block.match(/^(  (?:  )?)/);
    if (m) {
      var spaces = m[1];
      var blocklines = ("\n"+block).split(new RegExp("\n"+spaces)).join('\n');
      if (last) {
        last += '\n' + blocklines;
        output[output.length-1] = '```' + options.lang + last + '\n```';
      } else {
        output.push('```' + options.lang + blocklines + '\n```');
        last = blocklines;
      }
    } else {
      output.push(block);
      last = null;
    }
  });

  return output.join("\n\n");
};

/**
 * expandDefLists : expandDefLists(code)
 * Expands definition lists.
 */

exports.expandDefLists = function (code) {
  return eachBlock(code, function (block) {
    if (!block.match(/^~ /)) return block;

    var lines = block.split("\n");
    return lines.map(function (line) {
      var m = line.match(/^~ (.+) \((.+?)\):(?: (.+))?$/);
      if (m) return "* `"+m[1]+"` *("+m[2]+")* <span class='dash'>&mdash;</span> "+m[3];

      m = line.match(/^~ (.+) :$/);
      if (m) return "* `"+m[1]+"` <span class='dash'>&mdash;</span>";

      m = line.match(/^~ (.+): (.+)$/);
      if (m) return "* `"+m[1]+"` <span class='dash'>&mdash;</span> "+m[2];

      return line;
    }).join("\n");
  });
};

/**
 * eachBlock:
 * (internal) iteration helper. also works as map
 */

function eachBlock (code, fn) {
  var blocks = code.split('\n\n');
  return blocks.map(function (block) {
    return fn(block);
  }).join('\n\n');
}
