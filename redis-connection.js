import Redis from "ioredis";

function createRedisConnection() {
  // If a full connection string is provided (e.g., from Render Redis)
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL);
  }
  
  // Fallback to host/port (e.g., for local docker-compose)
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
  });   
  return redis;
}

export const redis = createRedisConnection();
export const publisher = createRedisConnection();
export const subscriber = createRedisConnection();