#!/bin/bash

read -r -d "" DATA << EOM
{
  "message": {
    "data": "eyJlbWFpbEFkZHJlc3MiOiJzYWxlc3JlcDF0ZXN0QHRhc2t3b3JsZC5jb20iLCJoaXN0b3J5SWQiOjE4Mjh9",
    "attributes": {},
    "message_id": "137113381694460",
    "messageId": "TEST",
    "publish_time": "2017-07-22T00:47:34.045Z",
    "publishTime": "2017-07-22T00:47:34.045Z"
  },
  "subscription": "projects/taskworld/subscriptions/gmail-webhook-dev"
}
EOM

HOST="https://$1/gmail-webhook"

echo "Posting JSON to ${HOST} .."
curl -X POST -H "Content-Type: application/json" -d "${DATA}" $HOST
