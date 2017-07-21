'use strict'

const Fs = require('fs')
const Path = require('path')
const Crypto = require('crypto')
const Google = require('./googleApi')

async function exchangeCodeForToken ({ code, file, credentials }) {
  if (!code) throw new Error('Missing "code" arg. Requires a Google auth code to be exchanged for a token.')
  if (!file) throw new Error('Missing "file" arg. Requires a file where to store the token.')
  if (!credentials) throw new Error('Missing "credentials" arg. Requires a credentials file containing a Google client id and secret etc.')

  const client = Google.getClient(credentials)
  const token = await Google.exchangeCodeForToken(client, code)
  Fs.writeFileSync(file, JSON.stringify(token, null, 2))
  console.log(`Wrote token to ${file}`)
}

async function printAuthUrl ({ credentials }) {
  if (!credentials) throw new Error('Missing "credentials" arg. Requires a credentials file containing a Google client id and secret etc.')

  const client = Google.getClient(credentials)
  console.log(`Follow this auth URL:\n` + Google.getAuthUrl(client))
}

async function fetchMessages (opts) {
  const { db, email, credentials, token, userId } = opts
  if (!db) throw new Error('Missing "db" arg. Requires a connected (open) MongoDB database handle, as returned by MongoClient.connect()')
  if (!email) throw new Error('Missing "email" arg. You must specify which email address to fetch threads for (i.e. threads between token owner and email).')
  if (!credentials) throw new Error('Missing "credentials" arg. Requires a credentials file containing a Google client id and secret etc.')
  if (!token) throw new Error('Missing "token" arg. Requires a valid Google token (a JSON object with access_token and refresh_token keys).')
  if (!userId) throw new Error('Missing "userId" arg. Requires user id of the owner of the token')

  const client = Google.getClient(credentials, token)

  let unfilteredMessageIds = []

  if (opts.update) {
    const latestMessage = await getLatestMessage(db, userId)
    if (!latestMessage) {
      console.log('Nothing to update. Run a full fetch.')
      return
    }

    const historyId = latestMessage.historyId
    const histories = await Google.gmail.listHistory(client, historyId)
    if (histories.history) {
      unfilteredMessageIds = histories.history.reduce((acc, x) => {
        if (x.messagesAdded) {
          x.messagesAdded.forEach(y => (acc.push(y.message.id)))
        }
        return acc
      }, [])
    }
    // console.log(`Result:\n` + JSON.stringify(histories, null, 2), unfilteredMessageIds)
    console.log(`Found ${unfilteredMessageIds.length} added messages.`)
    if (!unfilteredMessageIds.length) return
  } else {
    // List messages for the given email address.
    const r1 = await Google.gmail.listMessages(client, email)
    if (!r1 || !r1.messages) return

    unfilteredMessageIds = r1.messages.map(x => x.id)
  }

  // Filter out messages that we’ve already fetched.
  const messageIds = await filterExistingMessages(db, unfilteredMessageIds)

  console.log(`Kept ${messageIds.length} / ${unfilteredMessageIds.length} messages.`)
  if (!messageIds.length) return

  const messages = []
  for (const messageId of messageIds) {
    const r2 = await Google.gmail.getMessage(client, messageId)
    const message = getMessage(r2, userId)
    messages.push(message)
  }

  // Fetch attachments
  await fetchAttachments(client, db, messages)

  // Save messages
  await saveMessages(db, messages)
}

async function getLatestMessage (db, userId) {
  const [message] = await db.collection('gmail_messages')
  .find({ userId })
  .sort({ _id: -1 })
  .limit(1)
  .toArray()
  return message
}

async function checkAttachmentContentId (db, contentId) {
  return db.collection('gmail_attachment_content_hash')
  .findOne({ _id: contentId }, { fields: { _id: 1, localFile: 1 } })
}

async function saveAttachmentContentId (db, contentId, messageId, localFile) {
  const c = db.collection('gmail_attachment_content_hash')
  const exists = await c.findOne({ _id: contentId })
  if (!exists) {
    return c.insertOne({ _id: contentId, messages: [messageId], localFile })
  }
  return c.findOneAndUpdate({ _id: contentId }, { $addToSet: { messages: messageId } })
}

async function saveMessages (db, messages) {
  const result = await db.collection('gmail_messages')
  .insertMany(messages)
  console.log(`Saved ${result.result.n} messages.`)
}

async function filterExistingMessages (db, messageIds) {
  const messages = await db.collection('gmail_messages')
  .find({ _id: { $in: messageIds } })
  .project({ _id: 1 })
  .toArray()
  return messageIds.filter(x => !messages.find(y => y._id === x))
}

function getHash (str) {
  const hash = Crypto.createHash('sha256')
  hash.update(str)
  return hash.digest('hex')
}

function createFile (originalFilename, base64Data) {
  const filename = '/tmp/' + getHash(base64Data) + Path.extname(originalFilename)
  const data = Buffer.from(base64Data, 'base64')
  Fs.writeFileSync(filename, data)
  console.log(`Saved attachment: "${originalFilename}" (${data.length} bytes) to ${filename}`)
  return filename
}

async function fetchAttachments (client, db, messages) {
  const attachmentsMap = messages.reduce((acc, m) => {
    if (m.parts) {
      m.parts
      .filter(x => x.attachmentId)
      .forEach(x => {
        acc[x.attachmentId] = x
      })
    }
    return acc
  }, { })

  for (const attachmentId of Object.keys(attachmentsMap)) {
    const part = attachmentsMap[attachmentId]
    const existing = await checkAttachmentContentId(db, part.contentId)
    if (existing) {
      console.log(`Found existing attachment content: ${part.contentId}`)
      part.localFile = existing.localFile
    } else {
      // Download the attachment !
      const attachment = await Google.gmail.getAttachment(client, attachmentId, part.messageId)
      if (attachment.data) {
        part.localFile = createFile(part.filename, attachment.data)
      }
    }
    part.attachmentId = 'downloaded'
    await saveAttachmentContentId(db, part.contentId, part.messageId, part.localFile)
  }
}

function getMessage (m, userId) {
  const message = {
    _id: m.id,
    userId,
    threadId: m.threadId,
    labelIds: m.labelIds,
    snippet: m.snippet,
    historyId: m.historyId,
    date: m.internalDate
  }

  message.parts = m.payload.parts.reduce((acc, x) => {
    if (x.filename && x.body && x.body.attachmentId) {
      acc.push({
        messageId: message._id,
        partId: x.partId,
        mimeType: x.mimeType,
        filename: x.filename,
        size: x.body.size,
        attachmentId: x.body.attachmentId,
        contentId: x.headers.find(x => x.name === 'X-Attachment-Id').value
      })
    }

    if (x.parts) {
      x.parts.forEach(y => {
        // Skip html parts.
        if (y.mimeType === 'text/html') return
        acc.push({
          partId: y.partId,
          mimeType: y.mimeType,
          body: Buffer.from(y.body.data || '', 'base64').toString('utf8'),
          size: y.body.size
        })
      })
    }
    return acc
  }, [])

  return message
}

module.exports = {
  printAuthUrl,
  exchangeCodeForToken,
  fetchMessages
}
