FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# Set environment variables with defaults
ENV PORT=3000
ENV REDIS_HOST=valkey
ENV REDIS_PORT=6379

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
