# edge-notification-server

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
