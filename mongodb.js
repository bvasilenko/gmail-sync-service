'use strict'

const { log } = require('./log')

let _db

async function connect (url) {
  if (!_db) {
    const MongoClient = require('mongodb').MongoClient
    const db = await MongoClient.connect(url)
    log(`Connected to MongoDB server: ${url} (database: ${db.s.databaseName})`)
    _db = db
  }
  return _db
}

module.exports = {
  connect
}
