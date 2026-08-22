import mongoose, {Schema} from "mongoose"
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2"

const videoSchema = new Schema({
    videoFile: {
        type: String, //cloudinary url
        // Not required at creation time anymore: the record is created
        // immediately when the upload is accepted, before the background
        // worker has actually uploaded anything to Cloudinary yet.
    },
    thumbnail: {
        type: String, //cloudinary url
        // Same reasoning as videoFile above.
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    duration: {
        type: Number,
        default: 0
    },
    views: {
        type: Number,
        default: 0
    },
    isPublished: {
        type: Boolean,
        default: true,
    },
    // Tracks where this video is in the background processing pipeline -
    // "processing" the moment it's accepted, "ready" once the worker has
    // finished uploading it to Cloudinary, "failed" if that upload errored
    // out (see src/workers/video.worker.js).
    status: {
        type: String,
        enum: ["processing", "ready", "failed"],
        default: "processing",
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User"
    }
},
{
    timestamps: true
})

videoSchema.plugin(mongooseAggregatePaginate)

// Serves getAllVideos when filtered to one channel (owner) + published-only, sorted newest first
videoSchema.index({ owner: 1, isPublished: 1, createdAt: -1 })
// Serves the general feed (no owner filter): published-only, sorted newest first
videoSchema.index({ isPublished: 1, createdAt: -1 })

export const Video = mongoose.model("Video", videoSchema)