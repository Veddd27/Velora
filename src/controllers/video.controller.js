import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {Like} from "../models/like.model.js"
import {Subscription} from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {getCached, setCached, deleteCached} from "../utils/cache.js"
import {videoQueue} from "../queues/video.queue.js"


const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  // The feed doesn't depend on who's asking, so the whole response can be cached
  // as one shared answer per distinct combination of filters.
  const cacheKey = `feed:page=${page}:limit=${limit}:query=${query || ""}:sortBy=${sortBy || ""}:sortType=${sortType || ""}:userId=${userId || ""}`;

  const cachedVideos = await getCached(cacheKey);
  if (cachedVideos) {
    return res
      .status(200)
      .json(new ApiResponse(200, cachedVideos, "Videos fetched successfully"));
  }

  const pipeline = [];

  if (query) {
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
        ],
      },
    });
  }

  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid userId");
    }
    pipeline.push({
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    });
  }

  pipeline.push({ $match: { isPublished: true } });

  if (sortBy && sortType) {
    pipeline.push({
      $sort: {
        [sortBy]: sortType === "asc" ? 1 : -1,
      },
    });
  } else {
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$ownerDetails",
    }
  );

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const videoAggregate = Video.aggregate(pipeline);

  const videos = await Video.aggregatePaginate(videoAggregate, options);

  // Short TTL: a newly published video may take up to a minute to show up in
  // cached feed pages - an acceptable tradeoff since re-checking on every
  // request would defeat the point of caching the feed at all.
  await setCached(cacheKey, videos, 60);

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;

  if ([title, description].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "Title and description are required");
  }

  // Multer gives us req.files (because we're uploading 2 files)
  const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

  if (!videoFileLocalPath) {
    throw new ApiError(400, "Video file is required");
  }
  if (!thumbnailLocalPath) {
    throw new ApiError(400, "Thumbnail is required");
  }

  // Create the video record right away, in a "processing" state - notice
  // there's no Cloudinary upload happening on this request at all anymore.
  // videoFile/thumbnail/duration get filled in later by the worker.
  const video = await Video.create({
    title,
    description,
    owner: req.user?._id,
    isPublished: false,
    status: "processing",
  });

  // Hand the slow work off to the queue instead of doing it here. This one
  // line is the entire point of this feature: the request can respond right
  // now instead of the browser sitting there for however long Cloudinary
  // takes to ingest a large video file. The worker (running as its own
  // separate process - see src/workers/video.worker.js) will pick this job
  // up independently, whenever it's free, and do the actual upload.
  await videoQueue.add(
    "process-video",
    {
      videoId: video._id.toString(),
      videoFileLocalPath,
      thumbnailLocalPath,
    },
    {
      // If the worker crashes or Cloudinary has a transient failure, retry
      // this job automatically instead of losing it - up to 3 tries total,
      // waiting longer between each retry (5s, then 10s, then 20s).
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    }
  );

  // 202 Accepted (not 201 Created) - this signals "your request was valid
  // and accepted, but the actual work isn't finished yet."
  return res
    .status(202)
    .json(
      new ApiResponse(
        202,
        video,
        "Video upload received - processing in the background"
      )
    );
})

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId");
  }

  const cacheKey = `video:${videoId}`;

  // This is the part that's the same for every viewer, so it's safe to share
  // across everyone via the cache - it deliberately does NOT include isLiked
  // or isSubscribed, since those depend on who's asking.
  let videoData = await getCached(cacheKey);

  if (!videoData) {
    const video = await Video.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(videoId),
        },
      },
      {
        $lookup: {
          from: "likes",
          localField: "_id",
          foreignField: "video",
          as: "likes",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers",
              },
            },
            {
              $addFields: {
                subscribersCount: { $size: "$subscribers" },
              },
            },
            {
              $project: {
                username: 1,
                avatar: 1,
                subscribersCount: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          likesCount: { $size: "$likes" },
          owner: { $first: "$owner" },
        },
      },
      {
        $project: {
          videoFile: 1,
          thumbnail: 1,
          title: 1,
          description: 1,
          views: 1,
          createdAt: 1,
          duration: 1,
          comments: 1,
          owner: 1,
          likesCount: 1,
        },
      },
    ]);

    if (!video?.length) {
      throw new ApiError(404, "Video not found");
    }

    videoData = video[0];

    // Short TTL: like/view counts drift slightly stale between requests,
    // which is an acceptable tradeoff for not re-running this aggregation
    // on every single view.
    await setCached(cacheKey, videoData, 60);
  }

  // The personal part: never cached, always computed fresh for whoever is
  // asking. These two checks don't depend on each other, so they run
  // concurrently instead of one after another - each is a separate network
  // round-trip to MongoDB, and there's no reason to pay that cost twice in a
  // row when it can be paid once, in parallel.
  const [isLiked, isSubscribed] = await Promise.all([
    req.user
      ? Like.exists({ video: videoId, likedBy: req.user._id }).then(Boolean)
      : Promise.resolve(false),
    req.user
      ? Subscription.exists({
          subscriber: req.user._id,
          channel: videoData.owner._id,
        }).then(Boolean)
      : Promise.resolve(false),
  ]);

  const responseVideo = {
    ...videoData,
    isLiked,
    owner: { ...videoData.owner, isSubscribed },
  };

  const hasWatched = req.user?.watchHistory?.some(
    (id) => id.toString() === videoId.toString()
  );

  if (!hasWatched) {
    await Video.findByIdAndUpdate(videoId, {
      $inc: { views: 1 },
    });

    if (req.user?._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { watchHistory: videoId },
      });
    }

    responseVideo.views = (responseVideo.views || 0) + 1;
  }

  return res
    .status(200)
    .json(new ApiResponse(200, responseVideo, "Video details fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {


  const { videoId } = req.params;
  const { title, description } = req.body;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId");
  }

  if (!(title && description)) {
    throw new ApiError(400, "Title and description are required");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

 
  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not allowed to update this video");
  }


  const thumbnailLocalPath = req.file?.path;

  let thumbnailUpdate = {};
  if (thumbnailLocalPath) {
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
    if (!thumbnail) {
      throw new ApiError(400, "Error while uploading thumbnail");
    }
   
    thumbnailUpdate = { thumbnail: thumbnail.secure_url };
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        title,
        description,
        ...thumbnailUpdate,
      },
    },
    { new: true }
  );

  await deleteCached(`video:${videoId}`);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, "Video updated successfully"));
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Authorization check
  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not allowed to delete this video");
  }

  // Delete the video document
  await Video.findByIdAndDelete(videoId);
  await deleteCached(`video:${videoId}`);
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video deleted successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {

  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Authorization check
  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You are not allowed to toggle this video");
  }

  // Can't publish a video that the background worker hasn't finished
  // uploading yet - there'd be no actual videoFile/thumbnail to show.
  if (!video.isPublished && video.status !== "ready") {
    throw new ApiError(400, "Video is still processing and cannot be published yet");
  }

  const toggledVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        isPublished: !video?.isPublished,
      },
    },
    { new: true }
  );

  await deleteCached(`video:${videoId}`);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isPublished: toggledVideo.isPublished },
        "Publish status toggled successfully"
      )
    );
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}