# edge-push-server

[![Build Status](https://app.travis-ci.com/EdgeApp/edge-push-server.svg?branch=master)](https://app.travis-ci.com/EdgeApp/edge-push-server)

This server sends push notifications to Edge client apps. It contains an HTTP server that clients can use to register for notifications, and a background process that checks for price changes and actually sends the messages.

The docs folder has can find [an example of how to use the v2 API](./docs/demo.ts).

## Setup

This server requires a working copies of Node.js, Yarn, PM2, and CouchDB. We also recommend using Caddy to terminate SSL connections.

### Set up logging

Run these commands as a server admin:

```sh
mkdir /var/log/pm2
chown edgy /var/log/pm2
cp ./docs/logrotate /etc/logrotate.d/loginServer
```

### Manage server using `pm2`

First, tell pm2 how to run the server script:

```sh
# install:
pm2 start pm2.json
pm2 save

# check status:
pm2 monit
tail -f /var/log/pushServer.log
tail -f /var/log/priceDaemon.log

# manage:
pm2 reload pm2.json
pm2 restart pm2.json
pm2 stop pm2.json

pm2 restart pushServer // Just the HTTP server
pm2 restart priceDaemon // Just the price checker
```

### Updating

To update the code running on the production server, use the following procedure:

```sh
git pull
yarn
yarn prepare
pm2 restart pm2.json
```

Each deployment should come with its own version bump, changelog update, and git tag.
