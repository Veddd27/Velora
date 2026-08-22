import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {deleteCached} from "../utils/cache.js"


const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channelId");
  }

  if (channelId.toString() === req.user?._id.toString()) {
    throw new ApiError(400, "You cannot subscribe to yourself");
  }

  // Toggling changes the channel's subscribersCount, which is part of the
  // cached channel-profile data - so that cache entry needs to be cleared
  // either way this turns out.
  const channelUser = await User.findById(channelId).select("username");

  const alreadySubscribed = await Subscription.findOne({
    subscriber: req.user?._id,
    channel: channelId,
  });

  if (alreadySubscribed) {
    await Subscription.findByIdAndDelete(alreadySubscribed._id);

    if (channelUser) {
      await deleteCached(`channel:${channelUser.username}`);
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { isSubscribed: false },
          "Unsubscribed successfully"
        )
      );
  }

  try {
    await Subscription.create({
      subscriber: req.user?._id,
      channel: channelId,
    });
  } catch (error) {
    // A concurrent request already created this subscription (caught by the unique index) - treat as success
    if (error.code !== 11000) throw error;
  }

  if (channelUser) {
    await deleteCached(`channel:${channelUser.username}`);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isSubscribed: true },
        "Subscribed successfully"
      )
    );
});

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  if (!mongoose.isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channelId");
  }

  const subscribers = await Subscription.aggregate([
    // find all subscriptions where channel = channelId
    {
      $match: {
        channel: new mongoose.Types.ObjectId(channelId),
      },
    },
    // join with users to get subscriber details
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriber",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
              fullName: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$subscriber" },
    {
      $project: {
        subscriber: 1,
        createdAt: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, subscribers, "Subscribers fetched successfully")
    );
});

const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;

  if (!mongoose.isValidObjectId(subscriberId)) {
    throw new ApiError(400, "Invalid subscriberId");
  }

  const subscribedChannels = await Subscription.aggregate([
    // find all subscriptions where subscriber = subscriberId
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId),
      },
    },
    // join with users to get channel details
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "subscribedChannel",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
              fullName: 1,
            },
          },
        ],
      },
    },
    { $unwind: "$subscribedChannel" },
    {
      $project: {
        subscribedChannel: 1,
        createdAt: 1,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        subscribedChannels,
        "Subscribed channels fetched successfully"
      )
    );
});

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}