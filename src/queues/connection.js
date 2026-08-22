import Redis from "ioredis"

// BullMQ needs its own Redis connection (separate from the one used for
// caching in src/db/redis.js) because it requires maxRetriesPerRequest: null -
// this lets BullMQ safely use Redis's long-lived "block and wait for a job"
// commands, which is how the worker knows about new jobs instantly instead
// of having to constantly re-check ("poll") the list on a timer.
const bullConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
})

export default bullConnection
