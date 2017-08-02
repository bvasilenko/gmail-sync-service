'use strict'

const Google = require('googleapis')
const GoogleAuth = Google.auth.OAuth2

const credentials = require(process.env.GSS_GOOGLE_CREDENTIALS)
const { error } = require('./log')

const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/plus.me',
  'https://mail.google.com/',
  'email',
  'profile'
]

function getClient (token = { }) {
  const clientSecret = credentials.web.client_secret
  const clientId = credentials.web.client_id
  const redirectUrl = credentials.web.redirect_uris[0]

  const client = new GoogleAuth(clientId, clientSecret, redirectUrl)

  client.credentials = token

  return client
}

const auth = {
  verifyIdToken (client, idToken) {
    return new Promise((resolve, reject) => {
      client.verifyIdToken(idToken, credentials.web.client_id, (err, login) => {
        if (err) return reject(err)
        resolve(login.getPayload())
      })
    })
  },

  getAuthUrl (client) {
    return client.generateAuthUrl({
      access_type: 'offline', // Required to get refresh token.
      scope: SCOPES
    })
  },

  exchangeCodeForToken (client, code) {
    return new Promise((resolve, reject) => {
      client.getToken(code, (err, token) => {
        if (err) {
          error('Error while trying to retrieve access token', err)
          return reject(err)
        }
        client.credentials = token
        resolve(token)
      })
    })
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
  watchInbox (client, topicName, userId = 'me') {
    return new Promise((resolve, reject) => {
      const service = Google.gmail('v1')
      service.users.watch({
        auth: client,
        userId,
        // Use the resource key to add a payload to the request body when doing an HTTP POST.
        resource: { topicName }
      }, getApiResponseHandler(resolve, reject))
    })
  },

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

function getApiResponseHandler (resolve, reject) {
  return (err, response) => {
    if (err) {
      error('The API returned an error:', err)
      return reject(err)
    }
    resolve(response)
  }
}

module.exports = {
  getClient,
  auth,
  drive,
  gmail,
  plus
}
