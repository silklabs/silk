module.exports = visit;

function visit(old) {
    if (typeof(old) !== 'object' || old === null) {
        return old;
    }
    var copy = Array.isArray(old) ? [] : {};
    var keys = Object.keys(old).sort();
    keys.forEach(function(key) {
        copy[key] = visit(old[key]);
    });
    return copy;
}
