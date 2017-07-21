'use strict'

const Google = require('googleapis')
const GoogleAuth = require('google-auth-library')

const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://mail.google.com/',
  'email',
  'profile',
  'https://www.googleapis.com/auth/plus.me'
]
function getClient (credentials, token = { }) {
  if (typeof credentials !== 'object') throw new Error('Missing credentials object arg')
  const clientSecret = credentials.web.client_secret
  const clientId = credentials.web.client_id
  const redirectUrl = credentials.web.redirect_uris[0]

  const auth = new GoogleAuth()
  const client = new auth.OAuth2(clientId, clientSecret, redirectUrl)

  client.credentials = token

  return client
}

function verifyIdToken (client, credentials, idToken) {
  return new Promise((resolve, reject) => {
    client.verifyIdToken(idToken, credentials.web.client_id, (err, login) => {
      if (err) return reject(err)
      resolve(login.getPayload())
    })
  })
}

function getAuthUrl (client) {
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  })
}

function exchangeCodeForToken (client, code) {
  return new Promise((resolve, reject) => {
    client.getToken(code, (err, token) => {
      if (err) {
        console.error('[google] Error while trying to retrieve access token', err)
        return reject(err)
      }
      client.credentials = token
      console.log('[google] Got token:', token)
      resolve(token)
    })
  })
}

function getApiResponseHandler (resolve, reject) {
  return (err, response) => {
    if (err) {
      console.error('[google] The API returned an error:', err)
      return reject(err)
    }
    resolve(response)
  }
}

const drive = {
  listFiles (client) {
    return new Promise((resolve, reject) => {
      const service = Google.drive('v3')
      service.files.list({
        auth: client,
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)'
      }, getApiResponseHandler(resolve, reject))
    })
  }
}

const plus = {
  getProfile (client, email = null, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.plus('v1')
      service.people.get({
        auth: client,
        userId
      }, getApiResponseHandler(resolve, reject))
    })
  }
}

const gmail = {
  listThreads (client, email = null, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      const opts = {
        auth: client,
        userId
      }
      if (email) {
        opts.q = `from:${email} OR to:${email}`
      }
      service.users.threads.list(opts, getApiResponseHandler(resolve, reject))
    })
  },

  listHistory (client, startHistoryId, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      service.users.history.list({
        auth: client,
        startHistoryId,
        userId
      }, getApiResponseHandler(resolve, reject))
    })
  },

  listMessages (client, email = null, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      const opts = {
        auth: client,
        userId
      }
      if (email) {
        opts.q = `from:${email} OR to:${email}`
      }
      service.users.messages.list(opts, getApiResponseHandler(resolve, reject))
    })
  },

  getThread (client, threadId, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      service.users.threads.get({
        auth: client,
        id: threadId,
        userId
      }, getApiResponseHandler(resolve, reject))
    })
  },

  getMessage (client, messageId, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      service.users.messages.get({
        auth: client,
        id: messageId,
        userId
      }, getApiResponseHandler(resolve, reject))
    })
  },

  getAttachment (client, attachmentId, messageId, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      service.users.messages.attachments.get({
        auth: client,
        id: attachmentId,
        messageId,
        userId
      }, getApiResponseHandler(resolve, reject))
    })
  }
}

module.exports = {
  verifyIdToken,
  getClient,
  getAuthUrl,
  exchangeCodeForToken,
  drive,
  gmail,
  plus
}
