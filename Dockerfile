# Start from an official image that already has Node.js installed - "alpine"
# is a stripped-down, small version of Linux, which keeps the final image
# smaller than a full OS would.
FROM node:20-alpine

# All following commands run inside this folder within the container -
# it doesn't need to match any folder name on your actual computer.
WORKDIR /app

# Copy ONLY the dependency list first, install, and copy the rest of the
# code after. This looks backwards, but it's deliberate: Docker skips
# re-running a step if its inputs haven't changed since last time. Since
# your code changes far more often than your dependencies do, this ordering
# means "npm install" (the slow step) gets skipped on most rebuilds.
COPY package*.json ./
RUN npm install

# Now copy the actual application code.
COPY . .

# Documents that this container listens on port 8000 - informational only,
# the actual port mapping happens in docker-compose.yml.
EXPOSE 8000

# The default command if nothing else is specified - this runs the API
# server. The worker container (see docker-compose.yml) overrides this with
# its own command instead of using this default. Notice this uses plain
# "node", not "nodemon" - nodemon's whole job is watching files and
# restarting on changes, which doesn't apply inside a container (you'd
# rebuild the image instead of editing files live in production).
CMD ["node", "-r", "dotenv/config", "--experimental-json-modules", "src/index.js"]
