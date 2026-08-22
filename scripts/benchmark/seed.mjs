import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../../src/constants.js"
import { User } from "../../src/models/user.model.js"
import { Video } from "../../src/models/video.model.js"
import { Like } from "../../src/models/like.model.js"

// Every seeded document gets this marker in its title/content so cleanup
// (scripts/benchmark/cleanup.mjs) can remove EXACTLY this data and nothing
// else from the real database.
const MARKER = "BENCHMARK_SEED"

const NUM_USERS = 50
const NUM_VIDEOS = 10000
const NUM_LIKES = 20000

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
console.log("Connected. Seeding...")

// insertMany skips Mongoose pre-save hooks (like password hashing) - fine
// here since these fake accounts never need to actually log in.
const users = await User.insertMany(
    Array.from({ length: NUM_USERS }, (_, i) => ({
        username: `${MARKER}_user_${i}`,
        email: `${MARKER}_user_${i}@example.com`,
        fullName: `${MARKER} User ${i}`,
        avatar: "https://example.com/avatar.png",
        password: "not-a-real-password",
    }))
)
console.log(`Inserted ${users.length} users`)

const videos = await Video.insertMany(
    Array.from({ length: NUM_VIDEOS }, (_, i) => ({
        title: `${MARKER}_video_${i}`,
        description: `${MARKER} description for video ${i}`,
        videoFile: "https://example.com/video.mp4",
        thumbnail: "https://example.com/thumb.png",
        duration: 120,
        views: Math.floor(Math.random() * 1000),
        isPublished: true,
        status: "ready",
        owner: users[Math.floor(Math.random() * users.length)]._id,
    }))
)
console.log(`Inserted ${videos.length} videos`)

const likes = await Like.insertMany(
    Array.from({ length: NUM_LIKES }, () => ({
        video: videos[Math.floor(Math.random() * videos.length)]._id,
        likedBy: users[Math.floor(Math.random() * users.length)]._id,
    })),
    { ordered: false } // some may collide with the unique index - that's fine, just skip them
).catch((err) => {
    // insertMany with ordered:false still throws after attempting all inserts -
    // the successful ones are already in the DB, we just need the count.
    return err.insertedDocs || []
})
console.log(`Inserted ~${Array.isArray(likes) ? likes.length : NUM_LIKES} likes (some skipped as duplicates, which is expected)`)

console.log("Seeding complete. Sample video ID for benchmarking:", videos[0]._id.toString())
await mongoose.disconnect()
