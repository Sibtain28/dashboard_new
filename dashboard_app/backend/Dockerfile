# Use an official Node.js runtime as a parent image, using Alpine for a smaller footprint
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first for layer caching
COPY package*.json ./

# Install application dependencies for production
RUN npm ci --omit=dev

# Copy the rest of the backend source code
COPY . .

# Expose the port the backend runs on
EXPOSE 3001

# Start the backend using the existing start command
CMD ["npm", "start"]
