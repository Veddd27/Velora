import Redis from "ioredis"

const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379")

redisClient.on("connect", () => {
    console.log("Redis connected !!")
})

redisClient.on("error", (error) => {
    console.log("Redis connection error ", error)
})

export default redisClient
