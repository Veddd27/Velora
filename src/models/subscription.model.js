import mongoose, {Schema} from "mongoose"

const subscriptionSchema = new Schema({
    subscriber: {
        type: Schema.Types.ObjectId, // one who is subscribing
        ref: "User"
    },
    channel: {
        type: Schema.Types.ObjectId, // one to whom 'subscriber' is subscribing
        ref: "User"
    }
}, {timestamps: true})

// Prevents the same subscriber subscribing to the same channel twice, and
// serves getSubscribedChannels (lookups by subscriber)
subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true })
// Serves getUserChannelSubscribers and subscriber-count lookups (by channel)
subscriptionSchema.index({ channel: 1 })

export const Subscription = mongoose.model("Subscription", subscriptionSchema)