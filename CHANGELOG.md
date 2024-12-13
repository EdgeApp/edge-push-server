# edge-notification-server

## Unreleased

- removed: Unused legacy databases. The v1 routes continue to support security message registration, but won't remember any preferences.
- added: Validate deviceTokens with a RegExp.

## 2.3.3 (2024-10-08)

- fixed: Do not return 500 errors when CouchDB views are out-of-date.

## 2.3.2 (2024-09-14)

- fixed: Broken notifications due to deprecated Firebase API.

## 2.3.1 (2024-02-28)

- fixed: Don't fail sends when multiple Edge API keys share the same Firebase credentials.

## 2.3.0 (2023-05-01)

- added: Pino logging
- fixed: Avoid devices with invalid tokens in the `push-marketing` tool.
- fixed: Correctly report the device count in the `push-marketing` tool.

## 2.2.2 (2023-01-11)

- added: Marketing push-server notification CLI tool (`yarn cli push-marketing`)
- added: Record device IP and location
- added: Marketing opt-out setting for devices

## 2.2.1 (2022-10-18)

- changed: Optimize daemon loop processes, so we check more recent events more frequently.

## 2.2.0 (2022-10-11)

- added: Implement `any` and `all` trigger types for merging multiple triggers.
- removed: Do not broadcast transactions in response to price changes.
- removed: Stop performing string replacements for the messages associated with address-balance, price-level, and tx-confirm triggers.

## 2.1.0 (2022-10-06)

- added: Add a `send-message` CLI command for sending test messages,
- changed: Run daemon loops in Node.js child processes for stability.
- fixed: Do not push duplicate messages if the same phone is registered twice.
- fixed: Correctly read balances for EVM native currencies.

## 2.0.0 (2022-09-09)

- added: Introduce v2 API endpoints with more symmetry between devices & logins and support for more advanced subscription types.
- added: Migrate v1 login notification subscriptions to the new v2 database.
- removed: Stop sending push notifications for v1 price subscriptions.

## 1.4.0 (2022-08-26)

- added: Return a `fallbackSettings` flag when fetching missing currency settings.
- changed: Return better error messages when cleaners fail.
- changed: Return error messages as `error` instead of `message`.

## 1.3.1 (2022-08-02)

- fixed: Handle missing database items more correctly, either with proper errors or with fallbacks.

## 1.3.0 (2022-07-28)

- changed: Replace the Express routing with Serverlet.

## 1.2.0 (2022-07-27)

- changed: Move the logs to `/var/log/pm2`.
- fixed: Do not crash when accessing unregistered currency codes.

## 1.1.1 (2022-07-19)

- added: Travis CI integration.
- fixed: Upgrade vulnerable dependencies.

## 1.1.0 (2022-06-17)

- added: Document the deployment process.
- added: pm2 and logrotate config files.
- added: Automatically create & replicate necessary CouchDB databases.
- added: A new `push-settings` database to hold configuration documents.
- added: A new `pushServerConfig.json` file, created & managed by cleaner-config.
- changed: Rename the repo to `edge-push-server`.
- changed: Add modern code-quality and build tooling, and fix resulting errors.
- removed: Stop reading the old `serverConfig.json`, moving its contents to `pushServerConfig.json` and the `push-settings/settings` CouchDB document.

## 1.0.0 (2022-06-08)

- added: Began keeping a changelog.
