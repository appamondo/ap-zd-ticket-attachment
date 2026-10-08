/**
 * Demo example to add an email (body + attachments) to a Zendesk ticket as an internal note.
 *
 * Auth: OAuth client credentials grant. Create a confidential (not public) OAuth client in
 * Admin Center > Apps and integrations > APIs > OAuth Clients. The token acts as the
 * user associated with that client, so that user is shown as the note's author.
 * We use OAuth because API Tokens are being deprecated by Zendesk.
 *
 * Flow:
 *   0. Exchange the client ID + secret for an access token at POST /oauth/tokens.
 *   1. Upload each attachment to POST /api/v2/uploads. The first upload returns a token;
 *      pass that token on each later upload so all files are grouped under one token.
 *   2. Update the ticket with a comment that has public: false (an internal note) and
 *      includes the upload token. Zendesk attaches the files to that comment.
 *
 * Run:
 *   ZENDESK_SUBDOMAIN=yourcompany \
 *   ZENDESK_CLIENT_ID=your_client_identifier \
 *   ZENDESK_CLIENT_SECRET=xxxx \
 *   TICKET_ID=123 \
 *   node index.js
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const CLIENT_ID = process.env.ZENDESK_CLIENT_ID;
const CLIENT_SECRET = process.env.ZENDESK_CLIENT_SECRET;
const TICKET_ID = process.env.TICKET_ID;

const BASE_URL = `https://${SUBDOMAIN}.zendesk.com/api/v2`;

/**
 * Get an access token using the OAuth client credentials grant.
 * Tokens expire, so in a long-running service, cache the token and request a new
 * one shortly before `expires_in` runs out (or when you get a 401 but its good to have a buffer for some time).
 * You can fine tune scopes based on your needs, i.e. tickets:write. 
 * You can see more about scopes here: https://developer.zendesk.com/api-reference/ticketing/oauth/grant_type_tokens/#scope
 * Scopes can also be restricted when creating the OAuth client in the Zendesk Admin Center.
 */
async function getAccessToken() {
  const res = await fetch(`https://${SUBDOMAIN}.zendesk.com/oauth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'read write',
    }),
  });

  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

/**
 * Upload one file. Returns the upload token.
 * Pass `token` from a previous upload to add this file to the same group.
 */
async function uploadAttachment(accessToken, { filename, contentType, data }, token) {
  const params = new URLSearchParams({ filename });
  if (token) params.set('token', token);

  const res = await fetch(`${BASE_URL}/uploads.json?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: data, // raw file bytes
  });

  if (!res.ok) throw new Error(`Upload of ${filename} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.upload.token;
}

/**
 * Add an internal note to a ticket, with any uploaded files attached.
 */
async function addInternalNote(accessToken, ticketId, htmlBody, uploadToken) {
  const comment = {
    html_body: htmlBody,
    public: false, // false = internal note
  };
  if (uploadToken) comment.uploads = [uploadToken];

  const res = await fetch(`${BASE_URL}/tickets/${ticketId}.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket: { comment } }),
  });

  if (!res.ok) throw new Error(`Ticket update failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Main entry point: takes an email from your system and puts it on the ticket.
 */
async function sendEmailToZendesk(ticketId, email) {
  // 0. Get an OAuth access token.
  const accessToken = await getAccessToken();

  // 1. Upload attachments one at a time reusng the token from the first upload.
  let token;
  for (const attachment of email.attachments) {
    token = await uploadAttachment(accessToken, attachment, token);
  }

  // 2. Build the note body. replace this with your logic to parse your email body. This is just a demo example.
  const escape = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const htmlBody = `
    <p><strong>From:</strong> ${escape(email.from)}<br>
       <strong>Subject:</strong> ${escape(email.subject)}</p>
    <hr>
    ${email.html}
  `;

  // 3. Add the internal note with the attachments.
  return addInternalNote(accessToken, ticketId, htmlBody, token);
}

// ---------------------------------------------------------------------------
// Example usage. Replace this with the email data from your own system.
// ---------------------------------------------------------------------------
(async () => {
  const email = {
    from: 'customer@example.com',
    subject: 'Invoice query',
    html: '<p>Hi team,</p><p>Please see the attached invoice.</p>',
    attachments: [
      {
        filename: 'example.txt',
        contentType: 'text/plain',
        data: await fs.readFile(path.join(__dirname, 'example.txt')),
      },
    ],
  };

  const result = await sendEmailToZendesk(TICKET_ID, email);
  console.log(`Internal note added to ticket #${result.ticket.id}`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
