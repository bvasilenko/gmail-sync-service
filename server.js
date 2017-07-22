'use strict'

const Https = require('https')
const Express = require('express')
const Fs = require('fs')
const WebSocketServer = require('uws').Server
const Service = require('./google-service')
const Mongo = require('./mongodb')
const { log, error } = require('./log')

async function run (opts) {
  const host = process.env.GGS_HOST
  const port = process.env.GGS_PORT

  // Connect to MongoDB and setup indices.
  const db = await Mongo.connect(process.env.GGS_MONGO_URL)
  await Service.setupDb(db)

  const app = setupExpressApp(port, db, opts)

  const server = Https.createServer({
    cert: Fs.readFileSync(process.env.GGS_CERT),
    key: Fs.readFileSync(process.env.GGS_CERT_KEY)
  }, app)

  setupWebSocketServer(server, db)

  server.listen(port, host, () => {
    log(`Server running on https://${host}:${port} ..`)
  })
}

function setupExpressApp (port, db, { onUpdate }) {
  const app = Express()

  // Load middleware.
  const cors = require('cors')
  app.use(cors())

  const bodyParser = require('body-parser')
  // Parse application/x-www-form-urlencoded
  app.use(bodyParser.urlencoded({ extended: false }))
  // Parse application/json
  app.use(bodyParser.json())

  app.set('port', port)
  app.options('/', cors())

  app.get('/', (req, res) => {
    res.end('[GGS] Server: ' + new Date())
  })

  app.post('/gmail-webhook', (req, res) => {
    Service.handleGoogleNotification(db, req.body, onUpdate)
    .catch(err => error(err))
    res.json({ ok: 1 })
  })

  return app
}

function setupWebSocketServer (server, topics) {
  const wss = new WebSocketServer({ server, path: '/' })
  wss.on('connection', socket => {
    socket.on('message', data => {
      socket.send(data, { binary: Buffer.isBuffer(data) })
    })
  })
}

module.exports = {
  run
}
