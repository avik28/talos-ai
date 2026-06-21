FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist /app/dist
RUN npm install -g serve
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
