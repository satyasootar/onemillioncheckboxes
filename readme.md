



# One Million Checkboxes

## Project Overview
One Million Checkboxes is a real-time, interactive web application featuring one million checkboxes that users can toggle. The state of all the checkboxes is synchronized almost instantly across all connected clients. Users can register and log in to interact with the checkboxes, and a live feed history displays the most recent activities (users joining, registering, and checking/unchecking boxes).

https://github.com/user-attachments/assets/ccf99dd8-31ac-464a-b886-96332a89527e

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (for user registration and authentication)
- **In-Memory Datastore / Message Broker:** Redis (Valkey) (for caching the checkbox state, feed history, rate-limiting, and Pub/Sub mechanics)
- **Real-time Communication:** Socket.io
- **Security:** JWT (JSON Web Tokens) for authentication, bcryptjs for password hashing
- **Frontend:** HTML, CSS, JavaScript (Vanilla)

## Features Implemented
- One million interactive checkboxes rendered dynamically.
- Real-time synchronization of checkbox state across all connected users via WebSockets.
- User authentication (Register and Login) using secure password hashing and JWT.
- A live feed history showing the 50 most recent events (box toggles, user joins, new registrations).
- WebSocket-based Pub/Sub scaling to broadcast events smoothly.
- Rate limiting to prevent users from spamming the system with checkbox toggles.

## How to Run Locally

### Using Docker (Recommended)
This project includes a `docker-compose.yml` file which bundles the application along with Valkey (Redis alternative) and PostgreSQL.

1. Ensure [Docker](https://www.docker.com/) and Docker Compose are installed.
2. Clone the repository and navigate to the project directory.
3. Build and start the containers in detached mode:
   ```bash
   docker-compose up -d --build
   ```
4. Access the application in your browser at `http://localhost:3015`.

### Running Manually
1. Make sure you have Node.js, PostgreSQL, and Redis (or Valkey) installed and running locally.
2. Clone the repository and run:
   ```bash
   npm install
   ```
3. Create a `.env` file referencing your local services (see the Environment Variables section below).
4. Run the server:
   ```bash
   npm run dev
   ```
5. Access the application at `http://localhost:3000`.

## Environment Variables Required
To run the app locally without Docker, create a `.env` file in the root directory:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=secret
DB_NAME=checkboxes
JWT_SECRET=supersecret123
PORT=3000
```

## Redis Setup Instructions
The application uses Redis heavily for real-time operations. If you are using Docker, the `docker-compose.yml` uses the `valkey/valkey:latest` image, an open-source Redis fork, out of the box.

If you are running it natively:
1. Install Redis (or Valkey) on your system.
   - On Mac (using Homebrew): `brew install redis` then `brew services start redis`
   - On Linux (Ubuntu): `sudo apt install redis-server` then `sudo systemctl start redis`
   - On Windows: Use WSL (Windows Subsystem for Linux), or run it inside a Docker container:
     `docker run -p 6379:6379 -d redis:latest`
2. Ensure the service is running on the default port `6379`.

## Auth Flow Explanation
1. **Registration:** Users securely sign up by sending a `POST` request to `/register`. The backend uses `bcryptjs` to hash the password and stores the username and hashed password in a PostgreSQL database.
2. **Login:** Users log in by sending a `POST` request to `/login`. Upon successful verification of the credentials, the backend generates a JSON Web Token (JWT) signed with a secret key (`JWT_SECRET`) and returns it to the client.
3. **Session:** The frontend stores this token and includes it in WebSocket messages payload when attempting to toggle a checkbox, allowing the server to decode the user's identity securely.

## WebSocket Flow Explanation
1. When a client connects, an initial state of the one million checkboxes is fetched via a standard REST endpoint (`/checkbox-state`).
2. Once connected, Socket.io manages live, bidirectional communication between the client and server.
3. When a user clicks a checkbox, the frontend emits a `checkbox-change` event with the box index, new state, and the JWT.
4. The server validates the JWT. If authorized, it updates the box state in Redis and publishes the event to a Redis Pub/Sub channel.
5. All server instances subscribed to the Redis channel receive the update and emit a `checkbox-update` event to their respective locally connected Socket.io clients, seamlessly syncing the UI.

## Rate Limiting Logic Explanation
To prevent an individual user from spamming or overloading the application, rate limiting is implemented right inside the WebSocket `checkbox-change` listener using Redis.
1. Each client gets a unique key in Redis based on their socket connection ID (`rate-limit:<socket.id>`).
2. When an interaction occurs, the server checks the timestamp of the last operation.
3. If the time elapsed between clicks is less than 2000 milliseconds (2 seconds), the server rejects the request and emits a `server:error` back to the user suggesting exactly how long to wait.
4. If the request is permitted, the server writes the current timestamp back to Redis with a TTL of 5 seconds to ensure clean up over time.

## Screenshots / Demo
<img width="1897" height="928" alt="image" src="https://github.com/user-attachments/assets/3f414f70-a4ff-41a3-8943-8abe9896d4af" />
<img width="1315" height="837" alt="image" src="https://github.com/user-attachments/assets/443d33eb-8c6b-42ba-8374-5a2f75ab8af5" />
<img width="551" height="928" alt="image" src="https://github.com/user-attachments/assets/e94ddd11-1546-42d4-b795-ea2f166427b3" />


