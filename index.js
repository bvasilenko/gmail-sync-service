'use strict'

const Crypto = require('crypto')
const Path = require('path')
const Fs = require('fs')
const Google = require('./google')

const TOKEN_FILE = '/tmp/user_token.json'

run(require('minimist')(process.argv.slice(1)))
.catch(err => console.error(err))

async function run (opts) {
  try {
    opts.credentials = require(opts.credentials)

    if (opts.auth) {
      await auth(opts)
      return
    }
    if (opts.code) {
      await exchangeCodeForToken(opts)
      return
    }
    if (opts.test) {
      opts.token = require(TOKEN_FILE)
      await test(opts)
      return
    }

    throw new Error('No arguments.')
  } catch (err) {
    console.error(err.message)
    console.log(`
    Usage:
    node index.js
      --credentials   Google client secrets file to use (json).
      --auth          Get Google Auth URL.
      --code          Exchange code for access & refresh tokens.
      --test          Run various Gmail API calls.
    `)
  }
}

async function exchangeCodeForToken ({ credentials, code }) {
  const client = Google.getClient(credentials)
  const token = await Google.exchangeCodeForToken(client, code)
  Fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2))
  console.log(`Wrote token to ${TOKEN_FILE}`)
}

async function auth ({ credentials }) {
  const client = Google.getClient(credentials)
  if (!client.credentials.access_token) {
    console.log(`Follow this auth URL:\n` + Google.getAuthUrl(client))
    return
  }
}

async function test ({ credentials, token }) {
  const client = Google.getClient(credentials, token)

  // List threads for the given email address.
  const r1 = await Google.gmail.listThreads(client, 'anri@taskworld.com')
  console.log(`Result:\n` + JSON.stringify(r1, null, 2))

  if (!r1.threads) return

  for (const t of r1.threads) {
    const thread = await Google.gmail.getThread(client, t.id)
    const messages = getMessages(thread)
    await fetchAttachments(client, messages)

    console.log(`Messages:\n` + JSON.stringify(messages, null, 2))
  }
}

function createFile (originalFilename, base64Data) {
  const hash = Crypto.createHash('sha256')
  hash.update(base64Data)
  const filename = '/tmp/' + hash.digest('hex') + Path.extname(originalFilename)
  const buffer = Buffer.from(base64Data, 'base64')
  Fs.writeFileSync(filename, buffer)
  console.log(`Saved attachment: "${originalFilename}" (${buffer.length} bytes) to ${filename}`)
  return filename
}

async function fetchAttachments (client, messages) {
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

  for (const id of Object.keys(attachmentsMap)) {
    const part = attachmentsMap[id]
    const attachment = await Google.gmail.getAttachment(client, id, part.messageId)
    if (attachment.data) {
      part.localFile = createFile(part.filename, attachment.data)
    }
  }
}

function getMessages (thread) {
  const messages = []
  if (thread && thread.messages) {
    for (const m of thread.messages) {
      const message = {
        id: m.id,
        threadId: m.threadId,
        labelIds: m.labelIds,
        snippet: m.snippet,
        historyId: m.historyId,
        date: m.internalDate
      }

      message.parts = m.payload.parts.reduce((acc, x) => {
        if (x.filename && x.body && x.body.attachmentId) {
          acc.push({
            partId: x.partId,
            mimeType: x.mimeType,
            filename: x.filename,
            size: x.body.size,
            attachmentId: x.body.attachmentId,
            messageId: m.id
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

      // console.log(`Message:\n` + JSON.stringify(message, null, 2))
      messages.push(message)
    }
  }
  return messages
}
