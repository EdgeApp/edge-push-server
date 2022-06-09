# edge-push-server

This server sends push notifications to Edge client apps. It contains an HTTP server that clients can use to register for notifications, and a background process that checks for price changes and actually sends the messages.

## Setup

This server requires a working copies of Node.js, Yarn, PM2, and CouchDB. We also recommend using Caddy to terminate SSL connections.

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
