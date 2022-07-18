# Push Server CRD API
## Overview
Clients can interact with the push server through a CRD API that allows for the creation, reading and deletion of `Task` documents.


## Routers
As a REST API, the following routers implement HTTP methods:

|Router Name| HTTP Method      | Description |
|-----------| ----------- | ----------- |
|`getTaskRoute`| GET      | Expect to get an array of `taskIds`. If the array is empty, it will get all tasks for the given `userId`.      |
|`createTaskRoute`| POST   | Construct a body and returns it as an HttpResponse. The body will include a payload that conforms to the `Task` type. It will write to the CouchDB database to create such task.      |
|`deleteTaskRoute`| DELETE   | Remove tasks from the database. If the `taskIds` array is empty, it will remove all tasks under the `userId`.         |

