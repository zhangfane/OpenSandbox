# Copyright 2026 Alibaba Group Holding Ltd.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# -----------------------------------------------------------------------------
# CLI Tools & Directories
# -----------------------------------------------------------------------------
UV ?= uv
PNPM ?= pnpm
PYTHON ?= python3

SERVER_DIR := server
CONSOLE_DIR := console
K8S_DIR := kubernetes

# -----------------------------------------------------------------------------
# Configuration Variables
# -----------------------------------------------------------------------------
SERVER_HOST ?= 127.0.0.1
SERVER_PORT ?= 8080
CONSOLE_PORT ?= 5173
CONSOLE_DEV_SERVER ?= http://$(SERVER_HOST):$(SERVER_PORT)

# Insecure server mode bypasses the confirmation prompt when server.api_key is empty
OPENSANDBOX_INSECURE_SERVER ?= YES

# Auto-detect Docker daemon socket (supports OrbStack, Docker Desktop, Colima on macOS/Linux)
DOCKER_HOST ?= $(shell docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null)

export DOCKER_HOST
export OPENSANDBOX_INSECURE_SERVER
export CONSOLE_DEV_SERVER

ifdef SANDBOX_CONFIG_PATH
export SANDBOX_CONFIG_PATH
endif

ifdef API_KEY
export OPENSANDBOX_SERVER_API_KEY = $(API_KEY)
endif

# Optional test arguments
PYTEST_ARGS ?=
VITEST_ARGS ?=

# Docker image configuration
IMAGE_TAG ?= opensandbox/server:latest
OPERATOR_IMAGE_TAG ?= opensandbox/controller:latest
K8S_NAMESPACE ?= opensandbox-system
PUSH ?= false

# -----------------------------------------------------------------------------
# Phony Targets
# -----------------------------------------------------------------------------
.PHONY: help dev dev-server dev-console dev-frontend backend server frontend console \
        start build build-console build-server docker-build image image-server \
        image-operator operator-image image-controller controller-image images \
        k8s-update k8s-apply-crd k8s-apply-rbac k8s-restart k8s-status \
        install install-server install-console \
        test test-server test-console \
        lint lint-server lint-console \
        format format-server typecheck typecheck-server typecheck-console \
        init-config clean clean-server clean-console clean-all check-tools check-uv check-pnpm

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------

help: ## Show this help message
	@echo ""
	@printf "\033[1;34mOpenSandbox - Frontend & Backend Management\033[0m\n"
	@echo ""
	@printf "\033[1mUsage:\033[0m make \033[36m<target>\033[0m [VARIABLE=value]\n"
	@echo ""
	@printf "\033[1;33mQuick Start:\033[0m\n"
	@printf "  \033[36mmake dev\033[0m            Start both backend and frontend dev servers concurrently\n"
	@printf "  \033[36mmake start\033[0m          Build frontend & run integrated backend server on :$(SERVER_PORT)\n"
	@printf "  \033[36mmake image\033[0m          Build server (frontend+backend) Docker image [IMAGE_TAG=...]\n"
	@printf "  \033[36mmake image-operator\033[0m Build operator (controller) Docker image [OPERATOR_IMAGE_TAG=...]\n"
	@printf "  \033[36mmake images\033[0m         Build both server and operator Docker images\n"
	@printf "  \033[36mmake k8s-update\033[0m     Build images & update K8s (CRDs, RBAC, Deployments)\n"
	@printf "  \033[36mmake install\033[0m        Install all backend and frontend dependencies\n"
	@echo ""
	@printf "\033[1;33mAll Targets:\033[0m\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@printf "\033[1;33mConfiguration Variables:\033[0m\n"
	@printf "  SERVER_HOST         Backend host interface (default: %s)\n" "$(SERVER_HOST)"
	@printf "  SERVER_PORT         Backend port (default: %s)\n" "$(SERVER_PORT)"
	@printf "  CONSOLE_PORT        Console dev server port (default: %s)\n" "$(CONSOLE_PORT)"
	@printf "  API_KEY             API Key for backend authentication (optional)\n"
	@printf "  SANDBOX_CONFIG_PATH Custom config file path (default: ~/.sandbox.toml)\n"
	@printf "  IMAGE_TAG           Docker image tag for server (default: %s)\n" "$(IMAGE_TAG)"
	@printf "  OPERATOR_IMAGE_TAG  Docker image tag for operator (default: %s)\n" "$(OPERATOR_IMAGE_TAG)"
	@printf "  K8S_NAMESPACE       Kubernetes namespace for opensandbox (default: %s)\n" "$(K8S_NAMESPACE)"
	@printf "  PUSH                Set to true to push images to remote registry (default: %s)\n" "$(PUSH)"
	@echo ""

# -----------------------------------------------------------------------------
# Development Targets
# -----------------------------------------------------------------------------

dev: check-tools ## Start both backend and frontend dev servers concurrently (hot-reload)
	@printf "\033[1;32m=================================================================\033[0m\n"
	@printf "\033[1;32m  Starting OpenSandbox Fullstack Development Environment...\033[0m\n"
	@printf "  - Backend API:  \033[34mhttp://$(SERVER_HOST):$(SERVER_PORT)\033[0m\n"
	@printf "  - Backend Docs: \033[34mhttp://$(SERVER_HOST):$(SERVER_PORT)/docs\033[0m\n"
	@printf "  - Frontend App: \033[34mhttp://$(SERVER_HOST):$(CONSOLE_PORT)/console/\033[0m\n"
	@printf "\033[1;32m=================================================================\033[0m\n"
	@printf "\033[33mPress Ctrl+C to shut down both servers.\033[0m\n\n"
	@trap 'kill $$SERVER_PID $$CONSOLE_PID 2>/dev/null' EXIT INT TERM; \
	(cd $(SERVER_DIR) && $(UV) run python -m opensandbox_server.main) & SERVER_PID=$$!; \
	(cd $(CONSOLE_DIR) && $(PNPM) dev -- --port $(CONSOLE_PORT)) & CONSOLE_PID=$$!; \
	wait $$SERVER_PID $$CONSOLE_PID 2>/dev/null || true

dev-server: check-uv ## Start backend FastAPI server (with auto-reload)
	@printf "\033[1;32mStarting backend server on http://$(SERVER_HOST):$(SERVER_PORT)...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) run python -m opensandbox_server.main

dev-console: check-pnpm ## Start frontend Vite dev server (with HMR)
	@printf "\033[1;32mStarting console dev server on http://$(SERVER_HOST):$(CONSOLE_PORT)/console/...\033[0m\n"
	@cd $(CONSOLE_DIR) && $(PNPM) dev -- --port $(CONSOLE_PORT)

# Shortcuts / Aliases
backend: dev-server ## Alias for dev-server
server: dev-server ## Alias for dev-server
frontend: dev-console ## Alias for dev-console
console: dev-console ## Alias for dev-console
dev-frontend: dev-console ## Alias for dev-console

start: build dev-server ## Build frontend, stage into backend, and start integrated server (:8080)

# -----------------------------------------------------------------------------
# Dependency Installation
# -----------------------------------------------------------------------------

install: install-server install-console ## Install all dependencies (backend + frontend)

install-server: check-uv ## Install Python backend dependencies using uv
	@printf "\033[1;34mInstalling backend dependencies with uv...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) sync --all-groups

install-console: check-pnpm ## Install frontend dependencies using pnpm
	@printf "\033[1;34mInstalling console dependencies with pnpm...\033[0m\n"
	@cd $(CONSOLE_DIR) && $(PNPM) install

# -----------------------------------------------------------------------------
# Build & Package
# -----------------------------------------------------------------------------

build: build-console ## Build console and stage into backend server static files

build-console: check-pnpm ## Build console SPA and stage into server/opensandbox_server/static/console
	@printf "\033[1;34mBuilding console SPA and staging into server static assets...\033[0m\n"
	@cd $(CONSOLE_DIR) && $(PNPM) build:server

build-server: check-uv ## Build Python backend package wheel and sdist with uv
	@printf "\033[1;34mBuilding backend package with uv...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) build

docker-build: build-console ## Build frontend & package into local Docker image (e.g. make docker-build IMAGE_TAG=opensandbox/server:latest)
	@printf "\033[1;34mBuilding Docker image $(IMAGE_TAG) (including frontend + backend)...\033[0m\n"
	@docker build -f $(SERVER_DIR)/Dockerfile -t $(IMAGE_TAG) $(SERVER_DIR)
	@printf "\033[1;32mSuccessfully built $(IMAGE_TAG) (contains frontend & backend)\033[0m\n"

image: docker-build ## Alias for docker-build
image-server: docker-build ## Build server Docker image (contains frontend & backend)
server-image: image-server ## Alias for image-server

image-operator: ## Build Kubernetes operator (controller) Docker image (e.g. make image-operator OPERATOR_IMAGE_TAG=opensandbox/controller:latest)
	@printf "\033[1;34mBuilding Operator Docker image $(OPERATOR_IMAGE_TAG)...\033[0m\n"
	@docker build -f $(K8S_DIR)/Dockerfile --build-arg PACKAGE=./cmd/controller -t $(OPERATOR_IMAGE_TAG) $(K8S_DIR)
	@printf "\033[1;32mSuccessfully built $(OPERATOR_IMAGE_TAG)\033[0m\n"

operator-image: image-operator ## Alias for image-operator
image-controller: image-operator ## Alias for image-operator
controller-image: image-operator ## Alias for image-operator

images: image-server image-operator ## Build both Server (frontend+backend) and Operator images

# -----------------------------------------------------------------------------
# Kubernetes Deployment & Update Targets
# -----------------------------------------------------------------------------

k8s-apply-crd: ## Apply latest CRDs to Kubernetes cluster (server-side apply)
	@printf "\033[1;34mApplying CRDs to Kubernetes cluster...\033[0m\n"
	@kubectl apply --server-side --force-conflicts -f $(K8S_DIR)/config/crd/bases/
	@if [ -f manifests/charts/base/files/fast-sandbox-crds.yaml ]; then \
		kubectl apply --server-side --force-conflicts -f manifests/charts/base/files/fast-sandbox-crds.yaml; \
	fi

k8s-apply-rbac: ## Apply latest RBAC ClusterRoles to Kubernetes cluster (Controller & Server)
	@printf "\033[1;34mApplying Controller RBAC to Kubernetes cluster...\033[0m\n"
	@kubectl apply --server-side --force-conflicts -f $(K8S_DIR)/config/rbac/role.yaml
	@sed 's/name: manager-role/name: opensandbox-manager-role/' $(K8S_DIR)/config/rbac/role.yaml | kubectl apply --server-side --force-conflicts -f -
	@SA_CONTROLLER=$$(kubectl get deployment opensandbox-controller-manager -n $(K8S_NAMESPACE) -o jsonpath='{.spec.template.spec.serviceAccountName}' 2>/dev/null || true); \
	if [ -n "$$SA_CONTROLLER" ]; then \
		kubectl create clusterrolebinding opensandbox-controller-manager-role-binding --clusterrole=manager-role --serviceaccount=$(K8S_NAMESPACE):$$SA_CONTROLLER --dry-run=client -o yaml | kubectl apply -f -; \
	fi
	@printf "\033[1;34mApplying Server RBAC to Kubernetes cluster...\033[0m\n"
	@kubectl apply --server-side --force-conflicts -f manifests/server-role.yaml
	@SA_SERVER=$$(kubectl get deployment opensandbox-server -n $(K8S_NAMESPACE) -o jsonpath='{.spec.template.spec.serviceAccountName}' 2>/dev/null || true); \
	if [ -n "$$SA_SERVER" ]; then \
		kubectl create clusterrolebinding opensandbox-server-role-binding --clusterrole=opensandbox-server-role --serviceaccount=$(K8S_NAMESPACE):$$SA_SERVER --dry-run=client -o yaml | kubectl apply -f -; \
	fi

k8s-restart: ## Restart Server and Operator Deployments in Kubernetes
	@printf "\033[1;34mRestarting Deployments in namespace $(K8S_NAMESPACE)...\033[0m\n"
	@kubectl rollout restart deployment/opensandbox-server -n $(K8S_NAMESPACE)
	@kubectl rollout restart deployment/opensandbox-controller-manager -n $(K8S_NAMESPACE)
	@kubectl rollout status deployment/opensandbox-controller-manager -n $(K8S_NAMESPACE) --timeout=120s
	@kubectl rollout status deployment/opensandbox-server -n $(K8S_NAMESPACE) --timeout=120s

k8s-status: ## Show OpenSandbox Pods and Deployment status in Kubernetes
	@kubectl get deployments,pods -n $(K8S_NAMESPACE) -o wide

k8s-update: images k8s-apply-crd k8s-apply-rbac ## One-click: build images and update K8s (CRDs, RBAC, deployments)
	@printf "\033[1;34m=================================================================\033[0m\n"
	@printf "\033[1;34m  Updating OpenSandbox in Kubernetes ($(K8S_NAMESPACE))...\033[0m\n"
	@printf "\033[1;34m=================================================================\033[0m\n"
	@if [ "$(PUSH)" = "true" ]; then \
		printf "\033[1;34mPushing images to registry...\033[0m\n"; \
		docker push $(IMAGE_TAG); \
		docker push $(OPERATOR_IMAGE_TAG); \
	fi
	@if command -v kind >/dev/null 2>&1; then \
		CURRENT_CTX=$$(kubectl config current-context 2>/dev/null || true); \
		if [[ "$$CURRENT_CTX" == kind-* ]]; then \
			KIND_NAME=$${CURRENT_CTX#kind-}; \
			printf "\033[1;34mLoading images into Kind cluster ($$KIND_NAME)...\033[0m\n"; \
			kind load docker-image $(IMAGE_TAG) --name "$$KIND_NAME"; \
			kind load docker-image $(OPERATOR_IMAGE_TAG) --name "$$KIND_NAME"; \
		fi; \
	fi
	@printf "\033[1;34mEnsuring Server startup guard security env (OPENSANDBOX_INSECURE_SERVER=YES)...\033[0m\n"
	@kubectl set env deployment/opensandbox-server OPENSANDBOX_INSECURE_SERVER=YES -n $(K8S_NAMESPACE) >/dev/null
	@printf "\033[1;34mUpdating Server and Operator Deployment images...\033[0m\n"
	@SERVER_CONTAINER=$$(kubectl get deployment opensandbox-server -n $(K8S_NAMESPACE) -o jsonpath='{.spec.template.spec.containers[0].name}'); \
	kubectl set image deployment/opensandbox-server $$SERVER_CONTAINER=$(IMAGE_TAG) -n $(K8S_NAMESPACE)
	@CONTROLLER_CONTAINER=$$(kubectl get deployment opensandbox-controller-manager -n $(K8S_NAMESPACE) -o jsonpath='{.spec.template.spec.containers[0].name}'); \
	kubectl set image deployment/opensandbox-controller-manager $$CONTROLLER_CONTAINER=$(OPERATOR_IMAGE_TAG) -n $(K8S_NAMESPACE)
	@printf "\033[1;34mTriggering rolling restart...\033[0m\n"
	@kubectl rollout restart deployment/opensandbox-server -n $(K8S_NAMESPACE)
	@kubectl rollout restart deployment/opensandbox-controller-manager -n $(K8S_NAMESPACE)
	@printf "\033[1;34mWaiting for rollouts to finish...\033[0m\n"
	@kubectl rollout status deployment/opensandbox-controller-manager -n $(K8S_NAMESPACE) --timeout=120s
	@kubectl rollout status deployment/opensandbox-server -n $(K8S_NAMESPACE) --timeout=120s
	@printf "\033[1;32m=================================================================\033[0m\n"
	@printf "\033[1;32m  OpenSandbox Kubernetes upgrade completed successfully!\033[0m\n"
	@printf "  - Server Image:   \033[36m$(IMAGE_TAG)\033[0m\n"
	@printf "  - Operator Image: \033[36m$(OPERATOR_IMAGE_TAG)\033[0m\n"
	@printf "  - Namespace:      \033[36m$(K8S_NAMESPACE)\033[0m\n"
	@printf "\033[1;32m=================================================================\033[0m\n"
	@$(MAKE) k8s-status

# -----------------------------------------------------------------------------
# Testing & Code Quality
# -----------------------------------------------------------------------------

test: test-server test-console ## Run both backend and frontend tests

test-server: check-uv ## Run backend tests with pytest (e.g. make test-server PYTEST_ARGS=tests/test_console.py)
	@printf "\033[1;34mRunning backend tests...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) run pytest $(PYTEST_ARGS)

test-console: check-pnpm ## Run frontend tests with vitest
	@printf "\033[1;34mRunning frontend vitest tests...\033[0m\n"
	@cd $(CONSOLE_DIR) && $(PNPM) test $(VITEST_ARGS)

lint: lint-server lint-console ## Run code linting for backend (ruff) and frontend (eslint)

lint-server: check-uv ## Run ruff linter on backend
	@printf "\033[1;34mRunning ruff check on backend...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) run ruff check

lint-console: check-pnpm ## Run eslint on frontend
	@printf "\033[1;34mRunning eslint on console...\033[0m\n"
	@cd $(CONSOLE_DIR) && $(PNPM) lint

format: format-server ## Format backend code with ruff

format-server: check-uv ## Auto-format backend code with ruff format
	@printf "\033[1;34mFormatting backend code with ruff...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) run ruff format .

typecheck: typecheck-server typecheck-console ## Run type checking for backend (pyright) and frontend (tsc)

typecheck-server: check-uv ## Run pyright type checking on backend
	@printf "\033[1;34mRunning pyright on backend...\033[0m\n"
	@cd $(SERVER_DIR) && $(UV) run pyright

typecheck-console: check-pnpm ## Run TypeScript type checking on frontend
	@printf "\033[1;34mRunning typecheck on console...\033[0m\n"
	@cd $(CONSOLE_DIR) && $(PNPM) typecheck

# -----------------------------------------------------------------------------
# Utilities & Configuration
# -----------------------------------------------------------------------------

init-config: check-uv ## Initialize ~/.sandbox.toml from docker example if not present
	@cd $(SERVER_DIR) && $(UV) run python -m opensandbox_server.cli init-config --example docker || true

clean: clean-server clean-console ## Clean temporary caches and build artifacts

clean-server: ## Clean backend caches and build artifacts
	@printf "\033[1;34mCleaning backend caches and build files...\033[0m\n"
	@rm -rf $(SERVER_DIR)/.pytest_cache $(SERVER_DIR)/.ruff_cache $(SERVER_DIR)/dist $(SERVER_DIR)/*.egg-info
	@find $(SERVER_DIR) -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

clean-console: ## Clean frontend build artifacts
	@printf "\033[1;34mCleaning console build artifacts...\033[0m\n"
	@rm -rf $(CONSOLE_DIR)/dist $(CONSOLE_DIR)/node_modules/.vite $(CONSOLE_DIR)/tsconfig.tsbuildinfo

clean-all: clean ## Clean caches, virtual environment, and node_modules
	@printf "\033[1;31mCleaning virtual environments and node_modules...\033[0m\n"
	@rm -rf $(SERVER_DIR)/.venv $(CONSOLE_DIR)/node_modules

# -----------------------------------------------------------------------------
# Tool Verification
# -----------------------------------------------------------------------------

check-tools: check-uv check-pnpm ## Verify required CLI tools (uv, pnpm) are available

check-uv:
	@command -v $(UV) >/dev/null 2>&1 || (printf "\033[31mError: 'uv' is not installed. Please install uv: https://docs.astral.sh/uv/\033[0m\n" && exit 1)

check-pnpm:
	@command -v $(PNPM) >/dev/null 2>&1 || (printf "\033[31mError: 'pnpm' is not installed. Please install pnpm: https://pnpm.io/\033[0m\n" && exit 1)
