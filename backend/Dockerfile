# Use the official Playwright Python image so Chromium and all its system
# dependencies are already present — no extra apt installs needed.
FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

WORKDIR /app

# Install Python dependencies first (better layer caching).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source.
COPY . .

EXPOSE 8000

# Bind to 0.0.0.0 so the port is reachable from outside the container.
# --reload watches for source changes; the docker-compose volume mount makes
# this useful for local development without rebuilding the image.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
