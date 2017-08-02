#!/usr/bin/env node
'use strict'

require('dotenv').config()
const GoogleApi = require('./google-api')
const GoogleService = require('./google-service.js')
const Mongo = require('./mongodb')
const Server = require('./server')
const { log, error } = require('./log')

run(require('minimist')(process.argv.slice(1)))
.catch(err => error(err))

async function run (opts) {
  try {
    opts.client = GoogleApi.getClient()

    if (opts.auth) {
      return await GoogleService.printAuthUrl(opts)
    }

    if (opts.code) {
      return await GoogleService.exchangeCodeForToken(opts)
    }

    if (opts.messages) {
      opts.db = await Mongo.connect(process.env.GSS_MONGO_URL)
      opts.client.credentials = require(process.env.GSS_TOKEN_CACHE_FILE)
      return await GoogleService.fetchMessages(opts)
    }

    if (opts.server) {
      if (opts.onUpdate) {
        log(`Using update function: ${opts.onUpdate}`)
        opts.onUpdate = require(opts.onUpdate.includes('/') ? opts.onUpdate : `./${opts.onUpdate}`)
      }
      return Server.run(opts)
    }

    throw new Error('No arguments.')
  } catch (err) {
    error(err)

    log(`
    Usage:
    node cli.js
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
        --onUpdate    Path to JavaScript file to execute after receiving a Gmail webhook call.
                      NOTE: Path is relative to ./cli.js
    `)
  } finally {
    if (opts.db) opts.db.close()
  }
}
