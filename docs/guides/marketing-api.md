# Marketing API Guide

The Marketing API provides endpoints for sending targeted push notifications to devices based on geographical location. This API uses an asynchronous task queue system to handle large-scale message delivery efficiently.

> **Note**: If you're upgrading an existing installation, see the [Marketing API Migration Guide](./marketing-api-migration.md) for setup instructions.

## Authentication

All marketing endpoints require authentication via the `x-api-key` header. The API key must have either:

- `marketer: true` permission for marketing operations
- `admin: true` permission for full access

```bash
curl -H "x-api-key: your-api-key" \
  "https://your-server.com/marketing/count?country=United States"
```

## Endpoints

### GET /marketing/count

Query the number of devices available for targeting by location.

**Query Parameters:**

- `country` (optional): Target country name
- `region` (optional): Target region/state (requires country)
- `city` (optional): Target city (requires country)

**Example Request:**

```bash
curl -H "x-api-key: your-api-key" \
  "https://your-server.com/marketing/count?country=United%20States&region=CA&city=San%20Diego"
```

**Example Response:**

```json
{
  "counts": [
    {
      "location": {
        "country": "United States",
        "city": "San Diego",
        "region": "CA"
      },
      "count": 150
    }
  ],
  "total": 150
}
```

### POST /marketing/send

Create a marketing campaign task. Returns immediately with a task ID for tracking progress.

**Request Body:**

- `title` (required): Push notification title
- `body` (required): Push notification message body
- `country` (optional): Target country name
- `region` (optional): Target region/state (requires country)
- `city` (optional): Target city (requires country)

**Example Request:**

```bash
curl -X POST \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Special Offer!",
    "body": "Check out our new features and get 20% off!",
    "country": "United States",
    "region": "CA"
  }' \
  "https://your-server.com/marketing/send"
```

**Example Response:**

```json
{
  "taskId": "lzt9x2k-abc123",
  "status": "pending"
}
```

### GET /marketing/send/:taskId

Get the status and progress of a specific marketing task.

**Example Request:**

```bash
curl -H "x-api-key: your-api-key" \
  "https://your-server.com/marketing/send/lzt9x2k-abc123"
```

**Example Response:**

```json
{
  "taskId": "lzt9x2k-abc123",
  "createdTime": "2024-01-20T10:30:00Z",
  "status": "completed",
  "started": "2024-01-20T10:31:00Z",
  "completed": "2024-01-20T10:35:00Z",
  "location": {
    "country": "United States",
    "region": "CA"
  },
  "message": {
    "title": "Special Offer!",
    "body": "Check out our new features and get 20% off!"
  },
  "progress": {
    "total": 1500,
    "queried": 1500,
    "sent": 1400,
    "failed": 50,
    "filtered": 50
  }
}
```

### GET /marketing/sends

List all marketing tasks.

**Query Parameters:**

- `status` (optional): Filter by task status (`pending`, `processing`, `completed`, `failed`)
- `limit` (optional): Number of tasks to return (default: 100)
- `skip` (optional): Number of tasks to skip (default: 0)

**Example Request:**

```bash
curl -H "x-api-key: your-api-key" \
  "https://your-server.com/marketing/sends?status=completed&limit=10"
```

**Example Response:**

```json
{
  "tasks": [
    {
      "taskId": "lzt9x2k-abc123",
      "createdTime": "2024-01-20T10:30:00Z",
      "status": "completed",
      "location": {
        "country": "United States",
        "region": "CA"
      },
      "message": {
        "title": "Special Offer!",
        "body": "Check out our new features and get 20% off!"
      },
      "progress": {
        "total": 1500,
        "queried": 1500,
        "sent": 1400,
        "failed": 50,
        "filtered": 50
      }
    }
  ]
}
```

## Task States

Marketing tasks progress through the following states:

- **pending**: Task created and waiting to be processed
- **processing**: Task is currently being executed
- **completed**: Task finished successfully
- **failed**: Task encountered an error and stopped

## Progress Tracking

The progress object provides detailed statistics:

- **total**: Total number of devices found for the location
- **queried**: Number of devices processed so far
- **sent**: Number of successful push notifications sent
- **failed**: Number of devices that failed to receive the notification
- **filtered**: Number of devices filtered out (opted out of marketing, invalid tokens, etc.)

## Device Filtering

The system automatically filters out devices that:

- Have `ignoreMarketing: true` set
- Don't have a valid device token
- Have invalid token formats
- Don't have an associated API key

## Location Targeting

Location targeting follows a hierarchical structure:

1. **Country only**: Targets all devices in the specified country
2. **Country + Region**: Targets devices in the specified country and region/state
3. **Country + City**: Targets devices in the specified country and city
4. **Country + Region + City**: Most specific targeting

**Important**: When specifying `region` or `city`, you must also specify `country`.

## Error Responses

The API returns appropriate HTTP status codes and error messages:

**400 Bad Request:**

```json
{
  "error": "Missing country parameter when city or region is specified"
}
```

**401 Unauthorized:**

```json
{
  "error": "Missing API key"
}
```

**403 Forbidden:**

```json
{
  "error": "Not authorized for marketing operations"
}
```

**404 Not Found:**

```json
{
  "error": "Task not found"
}
```

**500 Internal Server Error:**

```json
{
  "error": "Failed to create marketing task"
}
```

## Best Practices

1. **Test with counts first**: Use `/marketing/count` to verify your targeting before creating a campaign
2. **Monitor task progress**: Poll `/marketing/send/:taskId` to track campaign progress
3. **Handle failures gracefully**: Check the `failed` count in progress and investigate if unusually high
4. **Use appropriate targeting**: More specific targeting (country + region + city) typically has better engagement
5. **Respect user preferences**: The system automatically honors marketing opt-outs, but consider additional consent mechanisms
6. **Rate limiting**: Don't create too many concurrent campaigns as they share processing resources

## Integration Example

Here's a complete example of creating and monitoring a marketing campaign:

```typescript
// 1. Check device count
const countResponse = await fetch(
  '/marketing/count?country=United States&region=CA',
  {
    headers: { 'x-api-key': 'your-api-key' }
  }
)
const { total } = await countResponse.json()
console.log(`Found ${total} devices to target`)

// 2. Create campaign
const sendResponse = await fetch('/marketing/send', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'New Feature Alert!',
    body: 'Try our latest update now available',
    country: 'United States',
    region: 'CA'
  })
})
const { taskId } = await sendResponse.json()
console.log(`Campaign created: ${taskId}`)

// 3. Monitor progress
const pollProgress = async () => {
  const response = await fetch(`/marketing/send/${taskId}`, {
    headers: { 'x-api-key': 'your-api-key' }
  })
  const task = await response.json()

  console.log(`Status: ${task.status}`)
  if (task.progress) {
    const { sent, failed, total } = task.progress
    console.log(
      `Progress: ${sent + failed}/${total} (${sent} sent, ${failed} failed)`
    )
  }

  if (task.status === 'completed' || task.status === 'failed') {
    return task
  }

  // Poll again in 10 seconds
  setTimeout(pollProgress, 10000)
}

pollProgress()
```

## Background Processing

Marketing tasks are processed by a background daemon that:

- Runs every 6 seconds checking for pending tasks
- Processes up to 5 tasks concurrently
- Updates task progress every 100 devices processed
- Handles device filtering and validation
- Integrates with the existing push notification infrastructure

The daemon can be monitored through server logs and will automatically retry failed operations where appropriate.

## Technical Details

For database schema, implementation details, and monitoring queries, see the [Marketing Database Schema](./marketing-database-schema.md) documentation.
