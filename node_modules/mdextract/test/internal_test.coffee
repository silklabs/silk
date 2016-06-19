require './setup'

describe 'Internal', ->
  it 'ok', ->
    str = """
    /**
     * hello:
     * (internal) its great
     */

    var x = y
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].internal).be.true

  it 'with new lines', ->
    str = """
    /**
     * hello:
     * (internal) abc
     * def
     * ghi
     */

    var x = y
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].internal).be.true

  it 'with code sample', ->
    str = """
    /**
     * get : get(x)
     * (internal) description
     */

    var x = y
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'get'
    expect(out[0].internal).be.true

  it 'private', ->
    str = """
    /**
     * hello:
     * (private) its great
     */

    var x = y
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].internal).be.true

  it 'negative', ->
    str = """
    /**
     * hello: its great
     */

    var x = y
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].internal).be.false

  describe 'toMarkdown', ->
    beforeEach ->
      @str = """
      /**
       * setFoo:
       * setter
       */

      setFoo = function() {};

      /**
       * _foo:
       * (private) private var
       */

      _foo = null;
      """

    it 'default output', ->
      out = mdextract(@str).toMarkdown()
      expect(out).to.not.match /_foo/

    it 'showInternal: true', ->
      out = mdextract(@str).toMarkdown({ showInternal: true })
      expect(out).to.match /_foo/
