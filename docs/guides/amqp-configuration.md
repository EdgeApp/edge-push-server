# AMQP Client Configuration Guide

## Overview

The Edge Push Server uses AMQP (Advanced Message Queuing Protocol) for reliable message delivery between the HTTP server and the push notification daemon. This guide explains how to configure the AMQP client before running the server.

## What is AMQP Used For?

The AMQP client serves as the messaging backbone for the push notification system:

1. **Message Queue**: The HTTP server enqueues push notification requests into a RabbitMQ/AMQP queue named "messages"
2. **Decoupling**: Separates the HTTP API from the actual push notification delivery process
3. **Reliability**: Ensures messages aren't lost if the push daemon is temporarily down
4. **Load Management**: The queue prefetch is set to 50 messages to prevent overwhelming the push daemon

## Architecture Flow

```
HTTP Server → AMQP Queue ("messages") → Publish Daemon → Firebase/Push Services
```

## Configuration Requirements

### 1. Create Configuration File

Before running `yarn start`, create a `pushServerConfig.json` file in the project root:

```json
{
  "listenHost": "127.0.0.1",
  "listenPort": 8008,
  "amqpUri": "amqp://username:password@localhost:5672",
  "couchUri": "http://username:password@localhost:5984",
  "currentCluster": "production"
}
```

### 2. AMQP URI Format

The `amqpUri` follows the standard AMQP connection string format:

```
amqp://[username[:password]@]hostname[:port][/vhost]
```

Examples:

- Local development (Docker): `amqp://guest:guest@localhost:5672`
- Production with vhost: `amqp://edgeuser:securepass@rabbitmq.example.com:5672/edge`
- CloudAMQP: `amqp://user:pass@hostname.cloudamqp.com/instance`

### 3. Required AMQP Server Setup

Before starting the Edge Push Server, ensure you have:

1. **RabbitMQ Server version 3.12** (or compatible AMQP broker) running via Docker
2. **User credentials** with permissions to:
   - Create queues
   - Publish messages
   - Consume messages
   - Set prefetch count
3. **Network access** to the AMQP server on port 5672

### 4. Queue Configuration

The server automatically creates a queue named "messages" with:

- **Prefetch limit**: 50 messages (prevents memory overflow)
- **Manual acknowledgment**: Messages are only removed after successful processing
- **Durable**: Queue persists through server restarts (implementation dependent)

## RabbitMQ Setup (Docker)

**Important**: The Edge Push Server requires RabbitMQ version 3.12 with management interface.

Run the following Docker command to set up RabbitMQ:

```bash
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:3.12-management
```

This command:

- Uses RabbitMQ version 3.12 with management interface
- Exposes port 5672 for AMQP connections
- Exposes port 15672 for the web management UI
- Sets default credentials (guest/guest)

### Cloud Services Alternative

- **CloudAMQP**: Managed RabbitMQ hosting
- **Amazon MQ**: AWS managed message broker
- **Azure Service Bus**: Alternative AMQP-compatible service

## Troubleshooting

### Connection Errors

If you see connection errors when starting the server:

1. **Check AMQP server is running**:

   ```bash
   # For Docker RabbitMQ
   docker ps | grep rabbitmq
   docker logs rabbitmq
   ```

2. **Verify credentials**:

   ```bash
   # Test connection
   curl -i -u username:password http://localhost:15672/api/overview
   ```

3. **Check firewall/network**:
   ```bash
   telnet localhost 5672
   ```

### Common Issues

- **"Connection refused"**: AMQP server not running or wrong port
- **"Authentication failed"**: Incorrect username/password
- **"Access refused"**: User lacks necessary permissions
- **"Channel closed"**: Often indicates permission issues or resource limits

## Security Considerations

1. **Never commit** `pushServerConfig.json` with real credentials
2. **Use strong passwords** for production AMQP instances
3. **Enable TLS** for production: `amqps://` instead of `amqp://`
4. **Limit network access** to AMQP ports using firewall rules
5. **Use separate vhosts** for different environments (dev/staging/prod)

## Monitoring

Monitor your AMQP queue health:

- **Queue depth**: Messages waiting to be processed
- **Consumer count**: Should match number of publish daemons
- **Message rates**: Publishing vs consuming rates
- **Connection status**: Watch for disconnections

RabbitMQ Management UI (if enabled): `http://localhost:15672`

## Next Steps

After configuring AMQP:

1. Start the server: `yarn start`
2. Start the publish daemon: `yarn publish-daemon`
3. Monitor logs:
   - `/var/log/pushServer.log`
   - `/var/log/publishDaemon.log`
4. Test the connection using the demo script: `yarn demo`
