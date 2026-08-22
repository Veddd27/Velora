import fs from "fs"
import path from "path"

// --- small helpers to keep the collection definition below readable ---

const url = (segments, query = []) => ({
    raw: `{{baseUrl}}/${segments.join("/")}` + (query.length ? "?" + query.map(q => `${q.key}=${q.value}`).join("&") : ""),
    host: ["{{baseUrl}}"],
    path: segments,
    variable: segments
        .filter(s => s.startsWith(":"))
        .map(s => ({ key: s.slice(1), value: "" })),
    query: query.map(q => ({ ...q, disabled: q.disabled ?? false })),
})

const jsonBody = (obj) => ({
    mode: "raw",
    raw: JSON.stringify(obj, null, 2),
    options: { raw: { language: "json" } },
})

const formBody = (fields) => ({
    mode: "formdata",
    formdata: fields.map(f => ({
        key: f.key,
        type: f.type,
        value: f.type === "text" ? (f.value ?? "") : undefined,
        src: f.type === "file" ? [] : undefined,
        description: f.description ?? "",
    })),
})

const request = (name, method, segments, opts = {}) => {
    const item = {
        name,
        request: {
            method,
            header: [],
            url: url(segments, opts.query || []),
            description: opts.description || "",
        },
    }
    if (opts.body) item.request.body = opts.body
    if (opts.noAuth) item.request.auth = { type: "noauth" }
    if (opts.events) item.event = opts.events
    return item
}

const folder = (name, items) => ({ name, item: items })

// --- the actual collection ---

const collection = {
    info: {
        name: "StreamForge API",
        description: "StreamForge backend - video upload/streaming platform. Set `baseUrl` and log in via Users > Login User to auto-populate `accessToken`.",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: {
        type: "bearer",
        bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }],
    },
    variable: [
        { key: "baseUrl", value: "http://localhost:8000/api/v1", type: "string" },
        { key: "accessToken", value: "", type: "string" },
    ],
    item: [
        folder("Healthcheck", [
            request("Health Check", "GET", ["healthcheck"], { noAuth: true }),
        ]),

        folder("Users", [
            request("Register User", "POST", ["users", "register"], {
                noAuth: true,
                body: formBody([
                    { key: "fullName", type: "text" },
                    { key: "username", type: "text" },
                    { key: "email", type: "text" },
                    { key: "password", type: "text" },
                    { key: "avatar", type: "file" },
                    { key: "coverImage", type: "file" },
                ]),
            }),
            request("Login User", "POST", ["users", "login"], {
                noAuth: true,
                body: jsonBody({ username: "", email: "", password: "" }),
                description: "On success, the test script below saves the accessToken into the `accessToken` collection variable automatically - every other request in this collection reads it from there.",
                events: [
                    {
                        listen: "test",
                        script: {
                            type: "text/javascript",
                            exec: [
                                "if (pm.response.code === 200) {",
                                "    const body = pm.response.json();",
                                "    pm.collectionVariables.set('accessToken', body.data.accessToken);",
                                "    console.log('Saved accessToken to collection variable.');",
                                "}",
                            ],
                        },
                    },
                ],
            }),
            request("Logout User", "POST", ["users", "logout"]),
            request("Refresh Access Token", "POST", ["users", "refresh-token"], {
                noAuth: true,
                body: jsonBody({ refreshToken: "" }),
                description: "Only needed if you're not relying on cookies - paste a refreshToken here, or leave the cookie jar to handle it.",
            }),
            request("Change Current Password", "POST", ["users", "change-password"], {
                body: jsonBody({ oldPassword: "", newPassword: "" }),
            }),
            request("Get Current User", "GET", ["users", "current-user"]),
            request("Update Account Details", "PATCH", ["users", "update-account"], {
                body: jsonBody({ fullName: "", email: "" }),
            }),
            request("Update Avatar", "PATCH", ["users", "avatar"], {
                body: formBody([{ key: "avatar", type: "file" }]),
            }),
            request("Update Cover Image", "PUT", ["users", "cover-image"], {
                body: formBody([{ key: "coverImage", type: "file" }]),
            }),
            request("Get Channel Profile", "GET", ["users", "c", ":username"]),
            request("Get Watch History", "GET", ["users", "history"]),
        ]),

        folder("Videos", [
            request("Get All Videos (Feed)", "GET", ["videos"], {
                query: [
                    { key: "page", value: "1" },
                    { key: "limit", value: "10" },
                    { key: "query", value: "", disabled: true },
                    { key: "sortBy", value: "", disabled: true },
                    { key: "sortType", value: "", disabled: true },
                    { key: "userId", value: "", disabled: true },
                ],
            }),
            request("Publish A Video", "POST", ["videos"], {
                description: "Returns 202 immediately - the video starts in status=processing until the background worker finishes uploading it.",
                body: formBody([
                    { key: "title", type: "text" },
                    { key: "description", type: "text" },
                    { key: "videoFile", type: "file" },
                    { key: "thumbnail", type: "file" },
                ]),
            }),
            request("Get Video By Id", "GET", ["videos", ":videoId"]),
            request("Update Video", "PATCH", ["videos", ":videoId"], {
                body: formBody([
                    { key: "title", type: "text" },
                    { key: "description", type: "text" },
                    { key: "thumbnail", type: "file" },
                ]),
            }),
            request("Delete Video", "DELETE", ["videos", ":videoId"]),
            request("Toggle Publish Status", "PATCH", ["videos", "toggle", "publish", ":videoId"], {
                description: "Fails with 400 if the video's status isn't 'ready' yet (still processing).",
            }),
        ]),

        folder("Comments", [
            request("Get Video Comments", "GET", ["comments", ":videoId"], {
                query: [{ key: "page", value: "1" }, { key: "limit", value: "10" }],
            }),
            request("Add Comment", "POST", ["comments", ":videoId"], {
                body: jsonBody({ content: "" }),
            }),
            request("Update Comment", "PATCH", ["comments", "c", ":commentId"], {
                body: jsonBody({ content: "" }),
            }),
            request("Delete Comment", "DELETE", ["comments", "c", ":commentId"]),
        ]),

        folder("Likes", [
            request("Toggle Video Like", "POST", ["likes", "toggle", "v", ":videoId"]),
            request("Toggle Comment Like", "POST", ["likes", "toggle", "c", ":commentId"]),
            request("Toggle Tweet Like", "POST", ["likes", "toggle", "t", ":tweetId"]),
            request("Get Liked Videos", "GET", ["likes", "videos"]),
        ]),

        folder("Playlist", [
            request("Create Playlist", "POST", ["playlist"], {
                body: jsonBody({ name: "", description: "" }),
            }),
            request("Get Playlist By Id", "GET", ["playlist", ":playlistId"]),
            request("Update Playlist", "PATCH", ["playlist", ":playlistId"], {
                body: jsonBody({ name: "", description: "" }),
            }),
            request("Delete Playlist", "DELETE", ["playlist", ":playlistId"]),
            request("Add Video To Playlist", "PATCH", ["playlist", "add", ":videoId", ":playlistId"]),
            request("Remove Video From Playlist", "PATCH", ["playlist", "remove", ":videoId", ":playlistId"]),
            request("Get User Playlists", "GET", ["playlist", "user", ":userId"]),
        ]),

        folder("Subscription", [
            request("Get Channel Subscribers", "GET", ["subscription", "c", ":channelId"]),
            request("Toggle Subscription", "POST", ["subscription", "c", ":channelId"]),
            request("Get Subscribed Channels", "GET", ["subscription", "u", ":subscriberId"]),
        ]),

        folder("Tweets", [
            request("Create Tweet", "POST", ["tweets"], {
                body: jsonBody({ content: "" }),
            }),
            request("Get User Tweets", "GET", ["tweets", "user", ":userId"]),
            request("Update Tweet", "PATCH", ["tweets", ":tweetId"], {
                body: jsonBody({ content: "" }),
            }),
            request("Delete Tweet", "DELETE", ["tweets", ":tweetId"]),
        ]),

        folder("Dashboard", [
            request("Get Channel Stats", "GET", ["dashboard", "stats"]),
            request("Get Channel Videos", "GET", ["dashboard", "videos"]),
        ]),
    ],
}

const outPath = path.resolve("postman", "StreamForge.postman_collection.json")
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2))
console.log(`Wrote ${outPath}`)
