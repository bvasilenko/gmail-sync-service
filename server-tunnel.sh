#!/bin/bash
#
# This forwards remote connections from LOCALHOST:10003 to local address 127.0.0.1:10003
# You’ll need your remote host to proxy incoming calls the tunnel, see example nginx.conf.
#
ssh $1 -vnNT -R 10003:localhost:10003 -o ExitOnForwardFailure=yes -o ServerAliveInterval=15
