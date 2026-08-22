import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

function ensureCloudinaryConfig() {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    })
}

// cleanupLocalFile controls whether this function deletes the local temp
// file itself. Callers that only ever try once (register, avatar update,
// etc.) want the default (true) - clean up immediately either way. Callers
// that might RETRY the same upload (the BullMQ video worker) need to pass
// false, since deleting the file after a failed attempt would make every
// retry fail immediately too, just for a different reason (no file to read).
const uploadOnCloudinary = async (localFilePath, cleanupLocalFile = true) => {
    try {
        if (!localFilePath) return null

        ensureCloudinaryConfig()

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        console.log("File uploaded to Cloudinary:", response.url)
        if (cleanupLocalFile) fs.unlinkSync(localFilePath)
        return response

    } catch (error) {
        console.error("Cloudinary upload failed:", error.message)
        if (cleanupLocalFile && fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath)
        }
        return null
    }
}

export {uploadOnCloudinary}
