.PHONY: help build up down restart logs ps clean

help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker-compose build

up: ## Start containers
	docker-compose up -d
	@echo "App running at http://localhost:3000"
	@echo "Redis at localhost:6379"

down: ## Stop and remove containers
	docker-compose down

restart: down up ## Restart containers

logs: ## View logs (all services)
	docker-compose logs -f

logs-app: ## View app logs only
	docker-compose logs -f app

logs-redis: ## View Redis logs only
	docker-compose logs -f redis

ps: ## Show running containers
	docker-compose ps

clean: ## Remove containers, volumes, and images
	docker-compose down -v --rmi all
	rm -rf node_modules
	rm -rf captures/*

shell: ## Shell into app container
	docker-compose exec app sh

redis-cli: ## Connect to Redis CLI
	docker-compose exec redis redis-cli

status: ## Show Docker and app status
	@docker-compose ps
	@echo ""
	@curl -s http://localhost:3000/api/health | head -5

rebuild: ## Rebuild without cache
	docker-compose build --no-cache
