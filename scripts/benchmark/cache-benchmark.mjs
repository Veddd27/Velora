import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../../src/constants.js"
import { Video } from "../../src/models/video.model.js"
import redisClient from "../../src/db/redis.js"

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)

const sampleVideo = await Video.findOne({ title: { $regex: "^BENCHMARK_SEED_video_" } })
const videoId = sampleVideo._id

const average = (fn, iterations) => async () => {
    const times = []
    for (let i = 0; i < iterations; i++) {
        const start = performance.now()
        await fn()
        times.push(performance.now() - start)
    }
    return times.reduce((a, b) => a + b, 0) / times.length
}

// This is exactly the aggregation getVideoById runs on a cache MISS - i.e.
// the cost every single request paid before caching existed.
const runMongoAggregation = () =>
    Video.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
        { $lookup: { from: "likes", localField: "_id", foreignField: "video", as: "likes" } },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    { $lookup: { from: "subscriptions", localField: "_id", foreignField: "channel", as: "subscribers" } },
                    { $addFields: { subscribersCount: { $size: "$subscribers" } } },
                    { $project: { username: 1, avatar: 1, subscribersCount: 1 } },
                ],
            },
        },
        { $addFields: { likesCount: { $size: "$likes" }, owner: { $first: "$owner" } } },
    ])

// Pre-warm the cache once, exactly like a real first request would.
await redisClient.set(`video:${videoId}`, JSON.stringify({ warmed: true }), "EX", 60)

// This is exactly what getVideoById does on a cache HIT - just a Redis read.
const runCacheRead = () => redisClient.get(`video:${videoId}`)

const ITERATIONS = 100
console.log(`Averaging over ${ITERATIONS} runs each...\n`)

const mongoAvg = await average(runMongoAggregation, ITERATIONS)()
console.log(`MongoDB aggregation (cache MISS path):  ${mongoAvg.toFixed(2)} ms average`)

const redisAvg = await average(runCacheRead, ITERATIONS)()
console.log(`Redis GET (cache HIT path):             ${redisAvg.toFixed(2)} ms average`)

console.log(`\nSpeedup: ${(mongoAvg / redisAvg).toFixed(1)}x faster on a cache hit`)

await redisClient.quit()
await mongoose.disconnect()
