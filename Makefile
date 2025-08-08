# Update current branch with latest changes from main branch
# Usage: make git:update
git\:update:
	@echo "🔄 Updating current branch with latest changes from main..."
	@CURRENT_BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	echo "Current branch: $$CURRENT_BRANCH"; \
	git checkout main && \
	git pull && \
	git checkout $$CURRENT_BRANCH && \
	git merge main --no-edit && \
	echo "✅ Successfully updated '$$CURRENT_BRANCH' with latest changes from main"

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

.PHONY: git\:update experiments\:docker-test