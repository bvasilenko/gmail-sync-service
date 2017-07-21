'use strict'

const GoogleService = require('./googleService.js')
const TOKEN_FILE = '/tmp/user_token.json'

run(require('minimist')(process.argv.slice(1)))
.catch(err => console.error(err))

async function run (opts) {
  try {
    opts.credentials = require(opts.credentials)

    if (opts.auth) {
      await GoogleService.printAuthUrl(opts)
      return
    }

    if (opts.code) {
      opts.file = opts.file || TOKEN_FILE
      await GoogleService.exchangeCodeForToken(opts)
      return
    }

    if (opts.messages && opts.email) {
      opts.db = await connectToMongoDB('mongodb://localhost:27017/cream_dev')
      opts.token = require(TOKEN_FILE)
      await GoogleService.fetchMessages(opts)
      opts.db.close()
      return
    }

    throw new Error('No arguments.')
  } catch (err) {
    console.error(err)

    console.log(`
    Usage:
    node index.js
      --credentials   Google client secrets file to use (json).
      --auth          Get Google Auth URL.
      --code          Exchange code for access & refresh tokens.
      --messages      Fetch Gmail messages related to a given email address.
        --email       Fetch messages received from or sent to this email address (searching token owner’s inbox).
    `)
  }
}

async function connectToMongoDB (url) {
  const MongoClient = require('mongodb').MongoClient
  const db = await MongoClient.connect(url)
  console.log(`Connected correctly to server: ${db.s.databaseName}`)
  return db
}
