# Marketing Database Schema

This document describes the database schema changes for the Marketing API implementation.

## API Keys Schema Changes

### Updated Fields

The `ApiKey` interface in `src/types/pushTypes.ts` has been extended with a new field:

```typescript
export interface ApiKey {
  apiKey: string
  appId: string

  admin: boolean
  marketer: boolean // New field - grants marketing permissions
  adminsdk?: FirebaseAdminKey
}
```

### Database Storage

In CouchDB's `db_api_keys` database:

- `marketer` field defaults to `false` if not specified
- Existing API keys will have `marketer: false` until explicitly updated
- Admin keys (`admin: true`) automatically have marketing permissions

### Cleaner Updates

The `asCouchApiKey` cleaner in `src/db/couchApiKeys.ts` includes:

```typescript
export const asCouchApiKey = asCouchDoc(
  asObject<CouchApiKey>({
    appId: asString,
    admin: asBoolean,
    marketer: asOptional(asBoolean, false), // Defaults to false
    adminsdk: asOptional(asFirebaseAdminKey)
  })
)
```

## Marketing Tasks Schema

### New Database: `db_marketing_tasks`

A new CouchDB database stores marketing task information with the following structure:

```typescript
export interface MarketingTask {
  readonly taskId: string // Unique task identifier
  readonly createdTime: Date // Task creation timestamp

  // Task parameters
  readonly location: {
    country?: string
    city?: string
    region?: string
  }
  readonly message: {
    title: string
    body: string
  }

  // Task status
  status: MarketingTaskStatus // 'pending' | 'processing' | 'completed' | 'failed'
  started?: Date
  completed?: Date
  error?: string

  // Progress tracking
  progress: {
    total: number // Total devices found
    queried: number // Devices processed so far
    sent: number // Successfully sent notifications
    failed: number // Failed to send
    filtered: number // Filtered out (opted out, invalid tokens)
  }
}
```

### Document ID Format

Marketing task documents use a compound ID format for efficient querying:

```
{ISO_DATE}_{TASK_ID}
```

Example: `2024-01-20T10:30:00.000Z_lzt9x2k-abc123`

This allows:

- Chronological sorting by creation time
- Easy extraction of both timestamp and task ID
- Efficient range queries

### CouchDB Views

One view is created for efficient querying:

#### Status View (`_design/status`)

```javascript
function (doc) {
  emit([doc.status, doc.createdTime], null);
}
```

Enables queries like:

- All pending tasks
- Tasks by status with date ordering
- Date range queries within status

The view uses the `createdTime` field directly instead of parsing the document ID, making it more efficient and cleaner.

## Database Setup

### Initialization

The marketing tasks database is automatically created during server startup via `src/db/couchSetup.ts`:

```typescript
await Promise.all([
  setupDatabase(connections.couch, couchApiKeysSetup, options),
  setupDatabase(connections.couch, couchDevicesSetup, options),
  setupDatabase(connections.couch, couchEventsSetup, options),
  setupDatabase(connections.couch, couchMarketingTasksSetup, options), // New
  setupDatabase(connections.couch, devicesSetup, options),
  setupDatabase(connections.couch, usersSetup, options)
])
```

### Migration Considerations

For existing installations:

1. **API Keys**: Existing API keys will have `marketer: false` by default
2. **Database Creation**: The `db_marketing_tasks` database is created automatically
3. **No Data Migration**: This is a new feature with no existing data to migrate
4. **Backward Compatibility**: All existing endpoints and functionality remain unchanged

### Performance Considerations

1. **Indexing**: Views provide efficient access patterns for common queries
2. **Task Cleanup**: Consider implementing task cleanup for old completed/failed tasks
3. **Concurrent Processing**: The daemon processes up to 5 tasks concurrently
4. **Progress Updates**: Progress is updated every 100 processed devices to balance accuracy vs. performance

### Monitoring Queries

Useful CouchDB queries for monitoring:

```bash
# Get all pending tasks
GET /db_marketing_tasks/_design/status/_view/by-status?startkey=["pending"]&endkey=["pending",{}]

# Get failed tasks for investigation
GET /db_marketing_tasks/_design/status/_view/by-status?startkey=["failed"]&endkey=["failed",{}]&include_docs=true

# Get completed tasks
GET /db_marketing_tasks/_design/status/_view/by-status?startkey=["completed"]&endkey=["completed",{}]
```

## Database Operations

### Common Operations

The `src/db/couchMarketingTasks.ts` module provides:

- `createMarketingTask()` - Create new task
- `getMarketingTask()` - Get task by ID
- `updateMarketingTask()` - Update task status/progress
- `listMarketingTasks()` - List tasks with filters
- `getPendingMarketingTasks()` - Get tasks ready for processing

### Error Handling

- **Conflict Resolution**: Automatic retry on CouchDB conflicts
- **Missing Tasks**: Proper 404 handling for non-existent tasks
- **Invalid IDs**: Validation of task ID format

### Security

- **Access Control**: All users with marketing permissions can view all tasks
- **API Key Validation**: Marketing permission checked on all operations
- **Input Validation**: All inputs validated with cleaners
