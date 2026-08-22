import { Queue } from "bullmq"
import bullConnection from "./connection.js"

// This is the "to-do list" itself. The name "video-processing" is just a
// label - the worker (in src/workers/video.worker.js) listens for jobs on
// this exact same name so it knows which list to watch.
export const videoQueue = new Queue("video-processing", {
    connection: bullConnection,
})
