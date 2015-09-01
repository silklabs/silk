import createContext from './context';
import assert from 'assert';
import EmailSender from '../../src/server/email_sender';

suite('email sender', () => {
  let context = createContext();
  let subject;
  setup(() => {
    subject = new EmailSender(context.config);
  });

  test('#renderTemplate', () => {
    let ctx = {
      content: 'foobar'
    };

    let result = subject.renderTemplate('test', ctx);

    // Both render the content provided...
    assert.ok(result.txt.indexOf(ctx.content) !== -1);
    assert.ok(result.html.indexOf(ctx.content) !== -1);

    // CSS is inlined
    assert.ok(result.html.indexOf('320px') !== -1, 'css inlined');
  });

  if (!process.env.AWS_ACCESS_KEY_ID) {
    test.skip('Skipping #send (No AWS credentials [AWS_ACCESS_KEY_ID])');
    return;
  }

  test('#send', async () => {
    let options = {
      subject: 'emails',
      // email simulator:
      recipient: 'success@simulator.amazonses.com',
      body: subject.renderTemplate('test', {})
    };

    let result = await subject.send(options);
    assert.ok(result.data.MessageId, 'message was sent');
  });

});
