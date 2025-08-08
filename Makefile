# Build and run experiments app locally in Docker to test the full build pipeline
# Usage: make experiments:docker-test
experiments\:docker-test:
	@echo "🐳 Building experiments Docker image (no cache)..."
	@docker build --no-cache -f apps/experiments/Dockerfile -t experiments-test .
	@echo "🚀 Running experiments container locally..."
	@docker run -it --rm \
		-p 4000:4000 \
		--env-file apps/experiments/.env \
		-e LOGGING_OUTPUT_FORMAT=json \
		-e NODE_ENV=production \
		--name experiments-local \
		experiments-test

%:
	@:

.PHONY: experiments\:docker-test