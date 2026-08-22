import "dotenv/config"
import mongoose from "mongoose"
import { videoQueue } from "../../src/queues/video.queue.js"

const NUM_JOBS = 30

// Clear out any leftover jobs from previous runs/earlier testing so the
// counts below only ever reflect THIS run's jobs.
await videoQueue.obliterate({ force: true })

// This path only needs to exist INSIDE the worker container - it was baked
// into the image via `COPY . .` in the Dockerfile, since this whole scripts/
// folder is part of the repo.
const IN_CONTAINER_IMAGE_PATH = "/app/scripts/benchmark/test-thumbnail.png"

console.log(`Enqueuing ${NUM_JOBS} video-processing jobs...`)
const start = performance.now()

for (let i = 0; i < NUM_JOBS; i++) {
    await videoQueue.add("process-video", {
        videoId: new mongoose.Types.ObjectId().toString(),
        videoFileLocalPath: IN_CONTAINER_IMAGE_PATH,
        thumbnailLocalPath: IN_CONTAINER_IMAGE_PATH,
    })
}

console.log("Waiting for all jobs to finish (polling queue counts)...")
while (true) {
    const counts = await videoQueue.getJobCounts("completed", "failed", "active", "waiting")
    const done = counts.completed + counts.failed
    process.stdout.write(`\r  done: ${done}/${NUM_JOBS} (active: ${counts.active}, waiting: ${counts.waiting})   `)
    if (done >= NUM_JOBS) break
    await new Promise((r) => setTimeout(r, 200))
}

const elapsed = performance.now() - start
console.log(`\n\nTotal time to drain ${NUM_JOBS} jobs: ${(elapsed / 1000).toFixed(2)}s`)

await videoQueue.obliterate({ force: true })
console.log("Queue cleared for next run.")
process.exit(0)
