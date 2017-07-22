'use strict'

const Fs = require('fs')
const Path = require('path')
const Crypto = require('crypto')
const Google = require('./google-api')
const { log, error } = require('./log')

async function exchangeCodeForToken ({ client, code }) {
  if (!client) throw new Error('Missing "client" arg. Requires a Google API client.')
  if (!code) throw new Error('Missing "code" arg. Requires a Google auth code to be exchanged for a token.')

  const token = await Google.auth.exchangeCodeForToken(client, code)
  const file = process.env.GSS_TOKEN_CACHE_FILE
  Fs.writeFileSync(file, JSON.stringify(token, null, 2))
  log(`Wrote token to ${file}`)
}

async function printAuthUrl ({ client }) {
  if (!client) throw new Error('Missing "client" arg. Requires a Google API client.')
  log(`Follow this auth URL:\n` + Google.auth.getAuthUrl(client))
}

async function fetchMessages (opts) {
  const { client, db, userId, email } = opts
  if (!client) throw new Error('Missing "client" arg. Requires a Google API client.')
  if (!db) throw new Error('Missing "db" arg. Requires a connected (open) MongoDB database handle, as returned by MongoClient.connect().')
  if (!email) throw new Error('Missing "email" arg. Requires email address of the token owner.')
  if (!userId) throw new Error('Missing "userId" arg. Requires user id of the token owner.')

  let result
  let unfilteredMessageIds = []

  if (opts.watch) {
    // Setup Gmail watch for the token owner’s inbox.
    log(`Setting up Gmail watch for ${email} (id: ${userId}). Publishing to topic ${process.env.GGS_GOOGLE_TOPIC_NAME}`)
    result = await Google.gmail.watchInbox(client, process.env.GGS_GOOGLE_TOPIC_NAME)
    if (result && result.expiration) {
      const watchData = Object.assign({ }, result, { email })
      await saveWatch(db, userId, watchData)
    }
    return
  }

  if (opts.update) {
    let historyId = opts.historyId
    if (!historyId) {
      // Fetch only messages after the history id of the latest store message.
      const latestMessage = await getLatestMessage(db, userId)
      if (!latestMessage) {
        log('Nothing to update. Run a full fetch.')
        return
      }
      historyId = latestMessage.historyId
    }
    log(`Fetching inbox updates for ${email} since history id ${historyId}.`)

    const histories = await Google.gmail.listHistory(client, historyId)
    if (histories.history) {
      unfilteredMessageIds = histories.history.reduce((acc, x) => {
        if (x.messagesAdded) {
          x.messagesAdded.forEach(y => (acc.push(y.message.id)))
        }
        return acc
      }, [])
    }
    log(`Found ${unfilteredMessageIds.length} new / added messages since history id ${historyId}.`)
    if (!unfilteredMessageIds.length) return
  } else {
    // List messages for the given email address.
    // NOTE: If opts.only is an email address, we’ll filter messages to only those
    // sent to / received from that email address.
    result = await Google.gmail.listMessages(client, opts.only)
    if (!result || !result.messages) return
    unfilteredMessageIds = result.messages.map(x => x.id)
  }

  // Force refetching of messages if given --force flag.
  if (opts.force) {
    await db.collection('ggs_messages').deleteMany({ userId })
    await db.collection('ggs_attachment_content').deleteMany({ userId })
  }

  // Filter out messages that we’ve already fetched.
  const messageIds = await filterExistingMessages(db, unfilteredMessageIds)

  log(`Kept ${messageIds.length} / ${unfilteredMessageIds.length} messages.`)
  if (!messageIds.length) return

  const messages = []
  let count = 0

  // Fetch messages.
  for (const messageId of messageIds) {
    log(`${++count}. Fetching message ${messageId} ..`)
    result = await Google.gmail.getMessage(client, messageId)
    const message = getMessage(result, userId)
    messages.push(message)
  }

  // Fetch attachments.
  await fetchAttachments(client, db, messages)

  // Save messages.
  await saveMessages(db, messages)
}

async function handleGoogleNotification (db, json, updateFunction) {
  if (json && json.message && json.subscription) {
    const d = JSON.parse(Buffer.from(json.message.data, 'base64').toString())

    const data = {
      _id: json.message.messageId,
      email: d.emailAddress,
      historyId: d.historyId,
      subscription: json.subscription,
      created: new Date(json.message.publishTime)
    }

    // Get the user id from the watch entry.
    const watch = await getWatchByEmail(db, data.email)
    if (!watch) {
      error(`Error: No watch entry found for ${data.email}, something’s goofy!`)
      return
    }
    data.userId = watch._id

    // Allow test notifications to be inserted multiple times.
    if (data._id === 'TEST') {
      await db.collection('ggs_notifications').deleteOne({ _id: 'TEST' })
    }

    await db.collection('ggs_notifications').insertOne(data)
    log(`Saved google push notification for ${data.email}, published: ${data.created}`)

    if (typeof updateFunction === 'function') {
      log(`Running custom update function ..`)
      updateFunction(data)
    }
  }
}

function getWatchByEmail (db, email) {
  return db.collection('ggs_watch').findOne({ email })
}

function saveWatch (db, userId, data) {
  data.expiration = parseInt(data.expiration, 10)
  log(`Saving Gmail watch for ${data.email} (id: ${userId}) expiring on ${new Date(data.expiration)}`)
  return db.collection('ggs_watch').findOneAndUpdate(
    { _id: userId },
    { $set: data },
    { upsert: true } // upsert === true NOT upsert === 1 !
  )
}

async function getLatestMessage (db, userId) {
  const [message] = await db.collection('ggs_messages')
  .find({ userId })
  .sort({ _id: -1 })
  .limit(1)
  .toArray()
  return message
}

async function checkAttachmentContentHash (db, contentId) {
  return db.collection('ggs_attachment_content')
  .findOne({ _id: contentId }, { fields: { messages: 0 } })
}

async function saveAttachmentContentHash (db, contentId, messageId, other = { }) {
  const c = db.collection('ggs_attachment_content')
  const exists = await c.findOne({ _id: contentId })
  if (!exists) {
    return c.insertOne(Object.assign({ _id: contentId, messages: [messageId] }, other))
  }
  return c.findOneAndUpdate({ _id: contentId }, { $addToSet: { messages: messageId } })
}

async function saveMessages (db, messages) {
  const result = await db.collection('ggs_messages')
  .insertMany(messages)
  log(`Saved ${result.result.n} messages.`)
}

async function filterExistingMessages (db, messageIds) {
  const messages = await db.collection('ggs_messages')
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
  const filename = Path.resolve('/tmp', getHash(base64Data) + Path.extname(originalFilename))
  const data = Buffer.from(base64Data, 'base64')
  Fs.writeFileSync(filename, data)
  log(`Saved attachment: "${originalFilename}" (${data.length} bytes) to ${filename}`)
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

  let downloaded = 0
  let identical = 0

  for (const attachmentId of Object.keys(attachmentsMap)) {
    const part = attachmentsMap[attachmentId]
    const existing = await checkAttachmentContentHash(db, part.contentId)
    if (existing) {
      part.localFile = existing.localFile
      identical++
    } else {
      // Download the attachment.
      const attachment = await Google.gmail.getAttachment(client, attachmentId, part.messageId)
      downloaded++
      if (attachment.data) {
        part.localFile = createFile(part.filename, attachment.data)
      }
    }
    part.attachmentId = 'downloaded'

    const metadata = {
      localFile: part.localFile,
      userId: part.userId
    }
    await saveAttachmentContentHash(db, part.contentId, part.messageId, metadata)
  }

  log(`Downloaded ${downloaded} / ${Object.keys(attachmentsMap).length} attachments (identical: ${identical}).`)
}

function getMessage (m, userId) {
  // log('m:', JSON.stringify(m, null, 2))

  const [fromName, fromEmail] = m.payload.headers.find(x => x.name === 'From').value.split(' <')
  const [toName, toEmail] = m.payload.headers.find(x => x.name === 'To').value.split(' <')

  const message = {
    _id: m.id,
    userId,
    threadId: m.threadId,
    labelIds: m.labelIds,
    snippet: m.snippet,
    historyId: m.historyId,
    date: m.internalDate,
    fromName,
    fromEmail: fromEmail.replace('>', ''),
    toName,
    toEmail: toEmail.replace('>', '')
  }

  message.parts = m.payload.parts.reduce((acc, x) => {
    if (x.filename && x.body && x.body.attachmentId) {
      acc.push({
        userId,
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

async function setupDb (db) {
  await db.ensureIndex('ggs_messages', { userId: 1, fromEmail: 1 })
  await db.ensureIndex('ggs_messages', { userId: 1, toEmail: 1 })
  await db.ensureIndex('ggs_watch', { email: 1 })
  log('Google Gmail sync: setup db indexes.')
}

module.exports = {
  printAuthUrl,
  exchangeCodeForToken,
  fetchMessages,
  handleGoogleNotification,
  setupDb
}
