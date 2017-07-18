'use strict'

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
  const r1 = await Google.gmail.listMessages(client)
  if (r1.messages) {
    for (const message of r1.messages) {
      console.log(`message:\n` + JSON.stringify(message, null, 2))
    }
    // const r2 = await Google.gmail.getThread(client, message.threadId)
    // console.log(`Thread:\n`, JSON.stringify(r2, null, 2))
  } else {
    console.log(`Got nothing!\n`, JSON.stringify(r1, null, 2))
  }
}
