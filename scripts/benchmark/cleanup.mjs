import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../../src/constants.js"
import { User } from "../../src/models/user.model.js"
import { Video } from "../../src/models/video.model.js"
import { Like } from "../../src/models/like.model.js"

const MARKER = "BENCHMARK_SEED"

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)

// case-insensitive: the User schema lowercases usernames on save (lowercase: true)
const users = await User.find({ username: { $regex: `^${MARKER}_user_`, $options: "i" } }).select("_id")
const userIds = users.map((u) => u._id)

const videoResult = await Video.deleteMany({ title: { $regex: `^${MARKER}_video_` } })
const likeResult = await Like.deleteMany({ likedBy: { $in: userIds } })
const userResult = await User.deleteMany({ _id: { $in: userIds } })

console.log(`Deleted ${videoResult.deletedCount} videos, ${likeResult.deletedCount} likes, ${userResult.deletedCount} users`)
await mongoose.disconnect()
