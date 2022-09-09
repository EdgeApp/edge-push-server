# edge-notification-server

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
