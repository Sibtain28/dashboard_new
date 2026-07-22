# Use an official Node.js runtime as a parent image (Alpine for a smaller footprint)
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first for layer caching
COPY package*.json ./

# Install dependencies (including devDependencies like Vite)
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Expose the default Vite development port
EXPOSE 5173

# Start the Vite development server and expose it on all network interfaces
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
