# Fork-owned entry points (upstream Card-Forge has no Makefile).
# Gates log to target/gate-logs/<name>.log and print a summary plus the real exit code.
.PHONY: help check web-java-test web-front-check desktop-test web-dev web-server

GATE := scripts/gate.sh

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

check: ## Run only the gates this branch's changes need (vs origin/develop)
	@scripts/check-changed.sh

web-java-test: ## Java tests of forge-gui-web (and the modules it builds on)
	@$(GATE) web-java-test mvn -B -pl forge-gui-web -am test

web-front-check: ## Frontend: install, type-check, lint, unit tests, build
	@$(GATE) web-front-check bash -c 'cd forge-gui-web/frontend && pnpm install --frozen-lockfile && pnpm check && pnpm build'

desktop-test: ## Engine/AI/desktop suite (~2 min); needed only when upstream modules or the root pom change
	@$(GATE) desktop-test mvn -B -pl forge-gui-desktop -am test

web-dev: ## Frontend dev server on a per-worktree port; /ws proxies to this worktree's web-server (live: ?live=1#token=…)
	@port=$$(scripts/dev-port.sh 5200); bridge=$$(scripts/dev-port.sh 7700); echo "Vite on http://localhost:$$port/ (live: http://localhost:$$port/?live=1#token=<bridge token>)"; \
	cd forge-gui-web/frontend && FORGE_BRIDGE=http://127.0.0.1:$$bridge pnpm dev --port $$port --strictPort

web-server: ## Build forge-gui-web and run the bridge server on a per-worktree port (args: ARGS="--mode commander")
	@$(GATE) web-build mvn -B -pl forge-gui-web -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
	@port=$$(scripts/dev-port.sh 7700); echo "Bridge on http://127.0.0.1:$$port/"; \
	cd forge-gui-web && ./run-spike.sh --port $$port $(ARGS)
