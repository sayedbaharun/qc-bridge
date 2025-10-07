FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the application (if needed)
RUN npm run build || true

# Expose port (adjust if needed)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
