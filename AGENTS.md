# Edge Push Server Documentation Index

This file serves as the central index for all documentation in the Edge Push Server project.

## Documentation Structure

### Project Setup and Overview

#### `README.md`

- **When to read**: First time setting up the project, understanding basic server setup and deployment
- **Summary**: Project overview, setup instructions including AMQP/RabbitMQ 3.12 Docker configuration, PM2 management, and deployment procedures

### Configuration Guides

#### `docs/guides/amqp-configuration.md`

- **When to read**: Before running `yarn start` for the first time, when setting up development environment, or troubleshooting message queue issues
- **Summary**: Complete guide for configuring the AMQP client connection required by the push server, including RabbitMQ 3.12 Docker setup, connection string format, security considerations, and troubleshooting tips

### Additional Resources

#### `docs/demo.ts`

- **When to read**: When learning how to integrate with the v2 API, testing push notifications
- **Summary**: Example TypeScript code demonstrating how to use the Edge Push Server v2 API

#### `docs/logrotate`

- **When to read**: When setting up production server, configuring log management
- **Summary**: Log rotation configuration for managing server logs in production

## Quick Start

1. Read `README.md` for project setup
2. Configure AMQP by following `docs/guides/amqp-configuration.md`
3. Set up your `pushServerConfig.json` with database and AMQP credentials
4. Run `yarn install` and `yarn prepare`
5. Start the server with `yarn start`

## Architecture Overview

The Edge Push Server consists of:

- HTTP API server for device registration and notification triggers
- AMQP message queue for reliable message delivery
- Background daemons for processing notifications, price changes, and confirmations
- CouchDB for storing device registrations and settings
- Firebase Admin SDK for sending push notifications
