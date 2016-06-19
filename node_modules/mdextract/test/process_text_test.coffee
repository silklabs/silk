require './setup'

processText = null

describe 'Process text', ->
  before ->
    @doc = new mdextract.Document()
    processText = (args...) =>
      @doc.processText(args...)

  beforeEach ->
    @block = {}

  it 'heading', ->
    processText """
    constructor:
    ran on init
    """, @block

    expect(@block.heading).eq 'constructor'
    expect(@block.body).eq 'ran on init'

  it 'subheading', ->
    processText """
    map : _.map()
    maps function to elements
    """, @block

    expect(@block.heading).eq 'map'
    expect(@block.subheading).eq '_.map()'
    expect(@block.body).eq 'maps function to elements'

  it 'inline', ->
    processText """
    map: maps function to elements
    """, @block

    expect(@block.heading).eq 'map'
    expect(@block.body).eq 'maps function to elements'

  it 'inline2', ->
    processText """
    map: maps a function to
    multiple elements
    """, @block

    expect(@block.heading).eq 'map'
    expect(@block.body).eq 'maps a function to\nmultiple elements'

  it 'code blocks with 4-space indent', ->
    processText """
    map:
    does things

        function() {
        }

    and stuff
    """, @block

    expect(@block.body).eq '''
    does things

    ```js
    function() {
    }
    ```

    and stuff
    '''

  it 'complex code blocks', ->
    processText """
    map:
    does things

        var a = function() {
          return {
            foo: 'bar'
          };
        }

    and stuff
    """, @block

    expect(@block.body).eq '''
    does things

    ```js
    var a = function() {
      return {
        foo: 'bar'
      };
    }
    ```

    and stuff
    '''

  it 'code blocks with 2-space indent', ->
    processText """
    map:
    does things

      function() {
      }

    and stuff
    """, @block

    expect(@block.body).eq '''
    does things

    ```js
    function() {
    }
    ```

    and stuff
    '''

  it 'consolidates multiple blocks', ->
    processText """
    map:
    does things

      function() {
      }

      function() {
      }

    and stuff
    """, @block

    expect(@block.body).eq '''
    does things

    ```js
    function() {
    }

    function() {
    }
    ```

    and stuff
    '''

  describe 'definition lists', ->
    it 'basic', ->
      processText """
      map:
      does things

      ~ lol (string): hello
      """, @block

      expect(@block.body).eq '''
      does things

      * `lol` *(string)* <span class='dash'>&mdash;</span> hello
      '''

    it 'multiple', ->
      processText """
      map:
      does things

      ~ lang (string): language
      ~ force (boolean): forcing
      """, @block

      expect(@block.body).eq '''
      does things

      * `lang` *(string)* <span class='dash'>&mdash;</span> language
      * `force` *(boolean)* <span class='dash'>&mdash;</span> forcing
      '''

    it 'no type', ->
      processText """
      map:
      does things

      ~ lang: language
      """, @block

      expect(@block.body).eq '''
      does things

      * `lang` <span class='dash'>&mdash;</span> language
      '''

    it 'with new lines', ->
      processText """
      map:
      does things

      ~ lang (string): language
        etc
      ~ force (boolean): forcing
      """, @block

      expect(@block.body).eq '''
      does things

      * `lang` *(string)* <span class='dash'>&mdash;</span> language
        etc
      * `force` *(boolean)* <span class='dash'>&mdash;</span> forcing
      '''
