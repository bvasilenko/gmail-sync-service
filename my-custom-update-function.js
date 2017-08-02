'use strict'

const GoogleApi = require('./google-api')
const GoogleService = require('./google-service.js')
const Mongo = require('./mongodb')

module.exports = async function updateFunction ({ userId, email, historyId }) {
  const db = await Mongo.connect()

  // Fetch user’s token somehow.
  const token = require('/tmp/user_token.json')
  const client = GoogleApi.getClient(token)

  await GoogleService.fetchMessages({
    client,
    db,
    email,
    userId,
    historyId,
    update: true
  })
}
