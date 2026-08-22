import redisClient from "../db/redis.js"

const getCached = async (key) => {
    const cached = await redisClient.get(key)
    return cached ? JSON.parse(cached) : null
}

const setCached = async (key, value, ttlSeconds) => {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds)
}

const deleteCached = async (key) => {
    await redisClient.del(key)
}

export { getCached, setCached, deleteCached }
