# Google Gmail Sync

### Usage:

#### Step 0: Setup a Google Cloud Platform Project.

Go [here](https://console.cloud.google.com/apis/dashboard), setup a new project and create and download OAuth client ID credentials.

#### Step 1: Create an .env config file and fill it in as follows:

```bash
# Google Oauth client ID credentials
GSS_GOOGLE_CREDENTIALS=../google-gmail-sync-credentials.json
# Google Pub/Sub topic to subscribe to for Gmail watch updates.
GSS_GOOGLE_TOPIC_NAME=projects/taskworld/topics/gmail-webhook
# MongoDB connection URL.
GSS_MONGO_URL=mongodb://localhost/db_dev
# Where to store the user token (used mainly while testing).
GSS_TOKEN_CACHE_FILE=/tmp/user_token.json
# Server host
GSS_HOST=localhost
# Server port
GSS_PORT=10003
# Server TLS certificate
GSS_CERT=../keys/cert.crt
# Server TLS certificate private key
GSS_CERT_KEY=../keys/cert.key
```

#### Step 2: Test the command-line tool.

```bash
# Install Node dependencies.
$ yarn install

# Run the tool without flags, which prints it’s usage.
$ ./cli.js

    Usage:
    ./cli.js
      --auth          Get Google Auth URL.
      --code          Exchange code for access & refresh tokens.

      --messages      Fetch Gmail messages related to a given email address.
        --email       Token owner’s email address.
        --userId      Token owner’s user id in your system.
        --watch       Google Cloud Pub/Sub topic to publish changes to,
                      e.g. projects/taskworld/topics/gmail-webhook
                      NOTE: This topic must already exist.
        [--force]     Force refetching of messages (optional).
        [--only]      Fetch only messages that were received from or sent to this email address (optional).

      --server        Run a server that listens to incoming Gmail webhook calls.
                      This uses the Gmail watch API and Google Cloud Pub/Sub to watch the token owner’s inbox for
                      changes, outlined here:
                      https://developers.google.com/gmail/api/guides/push
                      https://cloud.google.com/pubsub/docs/push
```    

#### Step 3: Authenticate a Google user.

```bash
$ ./cli.js --auth
Follow this auth URL:
https://accounts.google.com/o/oauth2/auth?access_type=offline&scope=....

# Copy the code from the redirected URL and feed it back to ./cli.js
$ ./cli.js --code <CODE FROM REDIRECT URL>
```

You should now have a token in `/tmp/user_token.json` which is automatically used in subsequent calls to `./cli.js`.

#### Step 4: Fetch messages.

```bash
$ ./cli.js \
  --messages \
  --email  ace@base.se \  # Token owner’s email address.
  --userId USER1 \        # Token owner’s user id, i.e. a reference to a user id in your system.

[GSS] Connected to MongoDB server: mongodb://localhost/db_dev (database: db_dev)
[GSS] Kept 8 / 8 messages.
[GSS] 1. Fetching message 15d6d836d7420001 ..
[GSS] 2. Fetching message 15d6821649350002 ..
[GSS] 3. Fetching message 15d67c3811be0003 ..
[GSS] 4. Fetching message 15d67970ef890004 ..
[GSS] 5. Fetching message 15d64d2699cc0005 ..
[GSS] 6. Fetching message 15d5f9b7ca420006 ..
[GSS] 7. Fetching message 15d502e957370007 ..
[GSS] 8. Fetching message 15d502048ee30008 ..
[GSS] Saved attachment: "Screen Shot 2017-07-17 at 5.37.30 PM.png" (22123 bytes) to /tmp/e987c208149f17e35c83fad59c80f7a63fe94c7bcc5ebce363c5ce01f019e558.png
[GSS] Saved attachment: "Screen Shot 2017-07-20 at 5.46.22 PM.png" (93685 bytes) to /tmp/29a993df364c1455134e9ebb7c0975af0580977aef835a1b994d9e2845d4c452.png
[GSS] Saved attachment: "Screen Shot 2017-07-05 at 23.02.19.png" (48765 bytes) to /tmp/19403eae291ad4b1138d781d08ecd2350ed4d6ed336485e1cd69f86bb88256f4.png
[GSS] Downloaded 3 / 15 attachments (identical: 12).
[GSS] Saved 8 messages.
```

#### Step 5: Fetch updates since the last fetched message.

```bash
$ ./cli.js --messages --email ace@base.se --userId USER1 --update

[GSS] Connected to MongoDB server: mongodb://localhost/db_dev (database: db_dev)
[GSS] Found 0 new / added messages since history id 1888.
```

#### Step 6: Setup a watch for this user, i.e. the token owner.

```bash
$ ./cli.js --messages --email ace@base.se --userId USER1 --watch

[GSS] Connected to MongoDB server: mongodb://localhost/db_dev (database: db_dev)
[GSS] Setting up Gmail watch for ace@base.se (id: USER1). Publishing to topic projects/taskworld-crm-174408/topics/gmail-webhook
[GSS] Saving Gmail watch for ace@base.se (id: USER1) expiring on Mon Jul 31 2017 08:40:36 GMT+0700 (+07)
```

#### Step 7: Start a local server to listen for Google notifications (nice while testing).

```bash
# Terminal window 1
# Open a SSH tunnel to the remote host which Google will
# be pushing it’s notifications to.
$ ./server-tunnel.sh my-remote-host.nginx.com

# Terminal window 2
$ ./cli.js --server

[GSS] Connected to MongoDB server: mongodb://localhost/db_dev (database: db_dev)
[GSS] Server running on https://localhost:10003 ..

# Terminal window 3
$ ./post-test.sh

```

### Database

Running a fetch produces the following collections in MongoDB:

#### Collection: gss_messages
```json
[
  {
      "_id" : "15d6821649000001",
      "userId" : "USER1",
      "threadId" : "15d502048e000001",
      "labelIds" : [
          "UNREAD",
          "IMPORTANT",
          "CATEGORY_PERSONAL",
          "INBOX"
      ],
      "snippet" : "Have ya paid your dues, Jack? Yessir, the check is in the mail.",
      "historyId" : "1830",
      "date" : "1500690593000",
      "fromName" : "Anri Digholm",
      "fromEmail" : "anri@taskworld.com",
      "toName" : "Jack Burton",
      "toEmail" : "jburton@bigtroubleinlittle.china",
      "parts" : [
          {
              "partId" : "0.0",
              "mimeType" : "text/plain",
              "body" : "Have ya paid your dues, Jack? Yessir, the check is in the mail.",
              "size" : 63
          },
          {
              "userId" : "USER1",
              "messageId" : "15d6821649000001",
              "partId" : "1",
              "mimeType" : "image/png",
              "filename" : "Screen Shot 2017-07-17 at 5.37.30 PM.png",
              "size" : 22123,
              "attachmentId" : "downloaded",
              "contentId" : "15d501fec2f9a635ecc1",
              "localFile" : "/tmp/e987c208149f17e35c83fad59c80f7a63fe94c7bcc5ebce363c5ce01f019e558.png"
          },
      ]
  }
]
```
