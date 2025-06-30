# Load environment variables from .env file
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

.PHONY: build publish help fix-imports

# Build the package
build:
	npm run build

# Publish to GitHub Packages
publish:
	@if [ -z "$(GITHUB_TOKEN)" ]; then \
		echo "Error: GITHUB_TOKEN not found in .env file"; \
		exit 1; \
	fi
	GITHUB_TOKEN=$(GITHUB_TOKEN) yarn install && yarn build && NODE_AUTH_TOKEN=$(GITHUB_TOKEN) yarn publish

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make build   - Build the TypeScript package"
	@echo "  make publish - Publish to GitHub Packages (requires GITHUB_TOKEN in .env)"
	@echo "  make help    - Show this help message"

# Fix all TypeScript imports to include .js extensions for ESM compatibility
fix-imports:
	@echo "Fixing TypeScript imports to include .js extensions..."
	@node fix-imports.cjs
	@echo "Import fixing complete!"

# Default target
.DEFAULT_GOAL := help 