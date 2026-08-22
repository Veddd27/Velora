import "dotenv/config"
import mongoose from "mongoose"
import { DB_NAME } from "../../src/constants.js"
import { Video } from "../../src/models/video.model.js"

await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)

const runQuery = async (label) => {
    const explain = await Video.aggregate([
        { $match: { isPublished: true } },
        { $sort: { createdAt: -1 } },
        { $limit: 10 },
    ]).explain("executionStats")

    // The aggregation explain output nests the actual query stats a level in
    const stats = explain.stages
        ? explain.stages[0].$cursor.executionStats
        : explain.executionStats

    console.log(`\n--- ${label} ---`)
    console.log("Stage:", JSON.stringify(explain.stages?.[0]?.$cursor?.queryPlanner?.winningPlan?.inputStage?.stage || explain.queryPlanner?.winningPlan?.stage))
    console.log("Documents examined:", stats.totalDocsExamined)
    console.log("Documents returned:", stats.nReturned)
    console.log("Execution time (ms):", stats.executionTimeMillis)
}

console.log("Current indexes on Video collection:")
console.log(await Video.collection.getIndexes())

await runQuery("WITH index (current state)")

console.log("\nDropping the isPublished+createdAt index to simulate 'before'...")
await Video.collection.dropIndex("isPublished_1_createdAt_-1")

await runQuery("WITHOUT index (simulated 'before')")

console.log("\nRebuilding the index...")
await Video.collection.createIndex({ isPublished: 1, createdAt: -1 })
console.log("Index rebuilt.")

await mongoose.disconnect()
