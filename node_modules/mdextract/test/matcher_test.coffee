Matcher = require('../lib/matcher')

describe 'Matcher', ->
  @timeout 10

  beforeEach ->
    @matcher = new Matcher
      transaction: '%{amount} - %{description}'
      datedTransaction: '%{transaction} @ %{date}'
      amount: /\d+/
      description: /.*?/
      date: /.*?/

  it 'should work', ->

  describe '#switch', ->
    it 'positive', (done) ->
      @matcher.switch '20 - food',
        datedTransaction: (m) ->
        transaction: (m) ->
          expect(m.amount).eq '20'
          expect(m.description).eq 'food'
          done()

    it 'else', (done) ->
      @matcher.switch 'xyzxyz',
        datedTransaction: (m) ->
        transaction: (m) ->
        else: -> done()

    it 'single', (done) ->
      @matcher.switch '20',
        amount: (m) ->
          expect(m.amount).eq '20'
          done()

  describe 'parentheses', ->
    beforeEach ->
    it 'beginning', ->
      matcher = new Matcher
        transaction: '(%{amount}) %{description}'
        amount: /\d+/
        description: /.*?/

      m = matcher.match('transaction', '200 things')
      expect(m.amount).eq '200'
      expect(m.description).eq 'things'

    it 'middle', ->
      matcher = new Matcher
        transaction: '! (%{amount}) %{description}'
        amount: /\d+/
        description: /.*?/

      m = matcher.match('transaction', '! 200 things')
      expect(m.amount).eq '200'
      expect(m.description).eq 'things'

  describe '#match', ->
    it 'simple false', ->
      m = @matcher.match('transaction', 'x - y')
      expect(m).false

    it 'nested ok', ->
      m = @matcher.match('transaction', '20 - food')
      expect(m).eql {amount: '20', description: 'food', transaction: '20 - food'}

    it 'simple ok', ->
      m = @matcher.match('amount', '20')
      expect(m).eql {amount: '20'}

    it 'deep nested ok', ->
      m = @matcher.match('datedTransaction', '20 - food @ jan 25')
      expect(m).eql {amount: '20', description: 'food', date: 'jan 25', transaction: '20 - food', datedTransaction: '20 - food @ jan 25'}

  describe '#multi', ->
    beforeEach ->
      @ids = ['datedTransaction', 'transaction']

    it 'match none', ->
      m = @matcher.multi(@ids, 'xyz')
      expect(m).false

    it 'match 1', ->
      m = @matcher.multi(@ids, '20 - food')
      expect(m).eql {amount: '20', description: 'food', transaction: '20 - food', rule: 'transaction'}

    it 'match 2', ->
      m = @matcher.multi(@ids, '20 - food @ jan 26')
      expect(m).eql {amount: '20', description: 'food', date: 'jan 26', transaction: '20 - food', datedTransaction: '20 - food @ jan 26', rule: 'datedTransaction'}

  describe '#build', ->
    it 'nonexistent', ->
      expect(@matcher.build('...')).be.undefined

    it 'nonexistent partial', ->
      expect(@matcher.partial('...')).be.undefined

    it 'simple', ->
      expect(@matcher.build('amount').regexp).eql '^\\d+$'

    it 'simple partial', ->
      expect(@matcher.partial('amount').regexp).eql '\\d+'

    it 'simple indices', ->
      expect(@matcher.build('amount').indices).eql []

    it 'nested', ->
      expect(@matcher.build('transaction').regexp).eql '^(\\d+)\\s+-\\s+(.*?)$'

    it 'nested indices', ->
      expect(@matcher.build('transaction').indices).eql ["amount", "description"]

  describe '#build deeply nested', ->
    beforeEach ->
      @r = @matcher.build('datedTransaction')

    it 'regexp', ->
      expect(@r.regexp).eql "^((\\d+)\\s+-\\s+(.*?))\\s+@\\s+(.*?)$"

    it 'indices', ->
      expect(@r.indices).eql ['transaction', 'amount', 'description', 'date']

  describe 'repetitions', ->
    it '#match', ->
      matcher = new Matcher
        numbers: '(%{number} )+!'
        number: /\d+/

      m = matcher.match('numbers', '1 2 3 5 8 !')
      expect(m.number).eq '8'

  it 'trimming', ->
    @matcher = new Matcher
      options: {trim: true}
      number: /\d+/

    expect(@matcher.options.trim).true

    re = @matcher.build('number').regexp
    expect(re).eql /^\s*\d+\s*$/.source

  it 'alias', ->
    matcher = new Matcher
      transaction: '%{from:amount} - %{to:amount}'
      amount: /\d+/

    m = matcher.match('transaction', '200 - 300')
    expect(m.from).eq '200'
    expect(m.to).eq '300'

  describe 'multiples', ->
    beforeEach ->
      @matcher = new Matcher
        people: { many: 'person', separator: /, / }
        person: '%{age} %{name}'
        age: /\d+/
        name: /.*?/

    it 'regexp', ->
      re = @matcher.build('people').regexp
      expect(re).eq /^(?:\d+)\s+(?:.*?)(?:, (?:\d+)\s+(?:.*?))*$/.source
      expect("24 hi, 12 foo").match(new RegExp(re))
      expect("24 xyz").match(new RegExp(re))

    xit 'match', ->
      @matcher.match('people', '24 John, 23 Bea')
      #=> { people: [ { name:, age: }, ... ] }

