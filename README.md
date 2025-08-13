# edge-push-server

[![Build Status](https://app.travis-ci.com/EdgeApp/edge-push-server.svg?branch=master)](https://app.travis-ci.com/EdgeApp/edge-push-server)

This server sends push notifications to Edge client apps. It contains an HTTP server that clients can use to register for notifications, and a background process that checks for price changes and actually sends the messages.

The docs folder has can find [an example of how to use the v2 API](./docs/demo.ts).

## Setup

This server requires a working copies of Node.js, Yarn, PM2, CouchDB, and RabbitMQ 3.12 (via Docker). We also recommend using Caddy to terminate SSL connections.

### Configure AMQP Message Queue

The push server uses AMQP (RabbitMQ) for reliable message delivery between the HTTP server and push notification daemons. Before running `yarn start`, you must:

1. **Start RabbitMQ 3.12 using Docker**:

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:3.12-management
```

2. **Create a configuration file** `pushServerConfig.json` in the project root:

```json
{
  "listenHost": "127.0.0.1",
  "listenPort": 8008,
  "amqpUri": "amqp://guest:guest@localhost:5672",
  "couchUri": "http://username:password@localhost:5984"
}
```

For detailed AMQP configuration instructions, troubleshooting, and security considerations, see [docs/guides/amqp-configuration.md](./docs/guides/amqp-configuration.md).

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
