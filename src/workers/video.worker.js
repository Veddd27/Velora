import "dotenv/config"
import fs from "fs"
import { Worker } from "bullmq"
import connectDB from "../db/index.js"
import bullConnection from "../queues/connection.js"
import { Video } from "../models/video.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"

// This file runs as its own separate program (`npm run worker`), completely
// independent from the API server (`npm run dev`). It has no routes, no
// Express app - its only job is to sit here and watch the "video-processing"
// queue for new jobs, forever.

// A worker is a brand new Node process, so it needs its own MongoDB
// connection - it does NOT share one with the API server.
connectDB()

const worker = new Worker(
    "video-processing", // must match the queue name in src/queues/video.queue.js
    async (job) => {
        const { videoId, videoFileLocalPath, thumbnailLocalPath } = job.data

        console.log(`Processing video ${videoId}...`)

        // This is the exact slow work that used to block the upload request
        // directly. Now it happens here, on its own schedule, with nobody
        // waiting on it.
        //
        // cleanupLocalFile: false on both calls - if this job gets retried
        // (e.g. thumbnail fails after video already succeeded), the retry
        // needs BOTH original files still sitting on disk to redo the whole
        // thing cleanly from scratch.
        const videoFile = await uploadOnCloudinary(videoFileLocalPath, false)
        if (!videoFile) {
            throw new Error("Video file upload to Cloudinary failed")
        }

        const thumbnail = await uploadOnCloudinary(thumbnailLocalPath, false)
        if (!thumbnail) {
            throw new Error("Thumbnail upload to Cloudinary failed")
        }

        // Only now that BOTH uploads have actually succeeded is it safe to
        // delete the local temp files - nothing will need to retry from them.
        if (fs.existsSync(videoFileLocalPath)) fs.unlinkSync(videoFileLocalPath)
        if (fs.existsSync(thumbnailLocalPath)) fs.unlinkSync(thumbnailLocalPath)

        // Fill in the fields that were left blank when the record was first
        // created, and flip status to "ready" now that it's actually usable.
        await Video.findByIdAndUpdate(videoId, {
            videoFile: videoFile.secure_url,
            thumbnail: thumbnail.secure_url,
            duration: videoFile.duration,
            status: "ready",
        })

        console.log(`Video ${videoId} is ready`)
    },
    { connection: bullConnection }
)

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully`)
})

worker.on("failed", async (job, error) => {
    console.log(`Job ${job?.id} failed: ${error.message}`)

    // All 3 attempts (see the `attempts` option where the job was added)
    // have now been exhausted - mark the video as failed so it doesn't sit
    // stuck showing "processing" forever.
    if (job && job.attemptsMade >= job.opts.attempts) {
        await Video.findByIdAndUpdate(job.data.videoId, { status: "failed" })

        // No more retries will ever come - safe to clean up whatever temp
        // files are still on disk now.
        const { videoFileLocalPath, thumbnailLocalPath } = job.data
        if (fs.existsSync(videoFileLocalPath)) fs.unlinkSync(videoFileLocalPath)
        if (fs.existsSync(thumbnailLocalPath)) fs.unlinkSync(thumbnailLocalPath)
    }
})

console.log("Video worker is running and watching for jobs...")
