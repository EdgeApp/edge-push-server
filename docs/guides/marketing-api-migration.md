# Marketing API Migration Guide

This guide helps you migrate an existing Edge Push Server installation to support the new Marketing API.

## Overview

The Marketing API adds location-based push notification campaigns to your existing Edge Push Server. For complete API documentation and usage examples, see the [Marketing API Guide](./marketing-api.md).

## Migration Steps

### 1. Update Server Code

```bash
git pull
yarn install
yarn prepare
```

### 2. Database Migration

The Marketing API requires no manual database migration. The new `db_marketing_tasks` database is created automatically when the server starts.

**Existing data is not affected** - all current functionality remains unchanged.

### 3. API Key Configuration

Existing API keys will have `marketer: false` by default. To enable marketing access:

#### Option A: Update via CouchDB Fauxton Interface

1. Open CouchDB Fauxton: `http://localhost:5984/_utils`
2. Navigate to `db_api_keys` database
3. Edit the API key document
4. Add or update: `"marketer": true`
5. Save the document

#### Option B: Update via cURL

```bash
# Get current API key document
curl -X GET "http://username:password@localhost:5984/db_api_keys/your-api-key-here"

# Update with marketer permission (replace _rev with actual revision)
curl -X PUT "http://username:password@localhost:5984/db_api_keys/your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "_rev": "1-abc123...",
    "appId": "your-app-id",
    "admin": false,
    "marketer": true
  }'
```

### 4. Start Marketing Daemon

Add the marketing daemon to your PM2 configuration or run it manually:

#### Manual Start

```bash
npm run marketing-daemon
```

#### PM2 Configuration (pm2.json)

Add to your existing PM2 configuration:

```json
{
  "apps": [
    // ... existing apps ...
    {
      "name": "marketingDaemon",
      "script": "src/daemons/marketingDaemon.ts",
      "node_args": "-r sucrase/register",
      "log_file": "/var/log/marketingDaemon.log",
      "error_file": "/var/log/marketingDaemon.log",
      "out_file": "/var/log/marketingDaemon.log",
      "merge_logs": true
    }
  ]
}
```

Then restart PM2:

```bash
pm2 reload pm2.json
pm2 save
```

### 5. Restart Server

```bash
pm2 restart pushServer
# or for full restart
pm2 restart pm2.json
```

## Verification

### 1. Check Database Creation

Verify the new database exists:

```bash
curl "http://username:password@localhost:5984/_all_dbs" | grep marketing
```

Should return: `db_marketing_tasks`

### 2. Test API Access

Test device counting with your newly configured marketer API key. For endpoint details and examples, see the [Marketing API Guide](./marketing-api.md#endpoints).

### 3. Check Logs

Monitor logs for any errors:

```bash
tail -f /var/log/pushServer.log
tail -f /var/log/marketingDaemon.log  # if using PM2
```

## Troubleshooting

### Common Issues

**403 Forbidden on marketing endpoints**

- Verify the API key has `marketer: true` or `admin: true`
- Check the API key exists in `db_api_keys`

**Marketing daemon not processing tasks**

- Verify the daemon is running: `pm2 status`
- Check daemon logs for errors
- Ensure CouchDB is accessible

**Database connection errors**

- Verify CouchDB credentials in `pushServerConfig.json`
- Test CouchDB connectivity: `curl http://username:password@localhost:5984`

### Rollback Plan

If you need to rollback:

1. **Stop marketing daemon**: `pm2 stop marketingDaemon`
2. **Revert code**: `git checkout previous-version`
3. **Restart server**: `pm2 restart pushServer`

The marketing database can remain - it won't affect existing functionality.

## Post-Migration Tasks

### 1. Configure API Keys

Determine which API keys should have marketing access:

- Marketing team keys: Add `marketer: true`
- Admin keys: Already have access via `admin: true`
- Regular app keys: Leave as `marketer: false`

### 2. Monitor Performance

Initially monitor:

- Marketing daemon memory usage
- CouchDB disk space (tasks accumulate over time)
- Task processing times

### 3. Set Up Task Cleanup (Optional)

Consider implementing periodic cleanup of old completed tasks:

```bash
# Example: Delete completed tasks older than 30 days
# This is manual - automated cleanup could be added later
curl -X GET "http://username:password@localhost:5984/db_marketing_tasks/_design/status/_view/by-status?startkey=[%22completed%22]&endkey=[%22completed%22,{}]&include_docs=true" \
  | jq -r '.rows[] | select(.doc.completed < "2024-01-01") | .doc._id'
```

## Next Steps

After successful migration:

1. **Review the [Marketing API Guide](./marketing-api.md)** for complete endpoint documentation
2. **Understand the [database schema](./marketing-database-schema.md)** for technical details
3. **Test your integration** using the examples in the API guide
4. **Monitor performance** through daemon logs and task completion rates

## Support

For issues:

1. Check server logs first
2. Verify API key permissions
3. Test with simple device count queries
4. Check CouchDB connectivity and view creation

The Marketing API is designed to be non-intrusive - existing functionality remains unchanged even if marketing features are not used.
