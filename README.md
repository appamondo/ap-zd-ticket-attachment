# Zendesk email to internal note

This example shows how to add a theoretical email (its HTML body and any attachments) to an existing Zendesk ticket as an internal note. It gets an access token through the OAuth client credentials grant, uploads each attachment to `/api/v2/uploads`, then updates the ticket with a private comment (`public: false`) that carries the email body and that upload token. 

To try it, create a confidential OAuth client in Zendesk Admin Center and run `ZENDESK_SUBDOMAIN=yourco ZENDESK_CLIENT_ID=... ZENDESK_CLIENT_SECRET=... TICKET_ID=123 node index.js`, then replace the example `email` object at the bottom of `index.js` with data from your own system. The internal note's author is the user linked to the OAuth client (so if [jack@appamondo.com](mailto:jack@appamondo.com) created the OAuth client, the internal note on the ticket would be from that user in Zendesk) 

The example.txt file is used as the demonstration attachment. 
