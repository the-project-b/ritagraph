# Load environment variables from .env file
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

.PHONY: fly-deploy install docker-build help

# Deploy to Fly.io with build secret
fly-deploy:
	@if [ -z "$(GITHUB_TOKEN)" ]; then \
		echo "Error: GITHUB_TOKEN not found in .env file"; \
		exit 1; \
	fi
	fly deploy --build-secret GITHUB_TOKEN=$(GITHUB_TOKEN)

# Install dependencies and build with GitHub token
install:
	@if [ -z "$(GITHUB_TOKEN)" ]; then \
		echo "Error: GITHUB_TOKEN not found in .env file"; \
		exit 1; \
	fi
	GITHUB_TOKEN=$(GITHUB_TOKEN) npm install && npm run build

# Build Docker image locally with build secret
docker-build:
	@if [ -z "$(GITHUB_TOKEN)" ]; then \
		echo "Error: GITHUB_TOKEN not found in .env file"; \
		exit 1; \
	fi
	echo "$(GITHUB_TOKEN)" | docker build --secret id=GITHUB_TOKEN,src=/dev/stdin -t evaluator-local .

docker-run:
	docker run -p 4000:4000 evaluator-local

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies and build (requires GITHUB_TOKEN in .env)"
	@echo "  make docker-build - Build Docker image locally (requires GITHUB_TOKEN in .env)"
	@echo "  make fly-deploy   - Deploy to Fly.io with build secrets (requires GITHUB_TOKEN in .env)"
	@echo "  make help         - Show this help message"

# Default target
.DEFAULT_GOAL := help 