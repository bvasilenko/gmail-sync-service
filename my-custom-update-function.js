'use strict'

const GoogleApi = require('./google-api')
const GoogleService = require('./google-service.js')
const Mongo = require('./mongodb')

module.exports = async function updateFunction ({ userId, email, historyId }) {
  const db = await Mongo.connect()

  const user = await db.collection('users').findOne({ email })
  if (!user) throw new Error(`Could not find user with email ${email}`)

  const token = await db.collection('tokens').findOne({ userId: user._id })
  if (!token) throw new Error(`Could not find token with for user ${user.email}`)

  const client = GoogleApi.getClient(token)

  await GoogleService.fetchMessages({
    client,
    db,
    email: user.email,
    userId: user._id,
    historyId,
    update: true
  })
}
