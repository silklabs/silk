require './setup'

describe 'Mdextract', ->
  it 'ok', ->
    str = """
    /**
     * hello:
     * world
     * its great
     */

    var x = y
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].body).eq 'world\nits great'
    expect(out[0].docline).eq 1
    expect(out[0].codeline).eq 7
    expect(out[0].level).eq 3

  it 'pre block', ->
    str = """
    /**
     * hello:
     * world
     *
     *     abc
     *     def
     */
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].body).eq 'world\n\n```js\nabc\ndef\n```'
    expect(out[0].level).eq 3

  it 'level 2', ->
    str = "/*** hello:\n* world */"

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].level).eq 2

  it 'comment closing on doc heading EOL', ->
    str = "/** hello: world */"

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].heading).eq 'hello'
    expect(out[0].level).eq 3

  it 'comment closing on doc line EOL', ->
    str = """
    /**
     * hello:
     * world */
    """

    out = mdextract(str).blocks
    expect(out).have.length 1
    expect(out[0].body).eq 'world'
    expect(out[0].level).eq 3
