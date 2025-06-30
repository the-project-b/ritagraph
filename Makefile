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

%:
	@:

.PHONY: git\:update