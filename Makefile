# Fork-owned entry points (upstream Card-Forge has no Makefile).
# Gates log to target/gate-logs/<name>.log and print a summary plus the real exit code.
.PHONY: help check package web-java-test web-desktop-test web-front-check desktop-test web-sweep web-dev web-server play

GATE := scripts/gate.sh

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

check: ## Run only the gates this branch's changes need (vs origin/develop)
	@scripts/check-changed.sh

web-java-test: ## Java tests of fork-web (and the modules it builds on)
	@$(GATE) web-java-test mvn -B -pl fork-web -am test

web-desktop-test: ## Tests of fork-desktop-web (the launcher) only, not the desktop suite it builds on
	@$(GATE) web-desktop-test mvn -B -pl fork-desktop-web -am test -Dtest='forge.fork.desktop.*Test' -Dsurefire.failIfNoSpecifiedTests=false

web-front-check: ## Frontend: install, type-check, lint, unit tests, build
	@$(GATE) web-front-check bash -c 'cd fork-web/frontend && pnpm install --frozen-lockfile && pnpm check && pnpm build'

desktop-test: ## Engine/AI/desktop suite (~2 min); needed only when upstream modules or the root pom change
	@# alphabetical class order: surefire's default (filesystem) order varies per checkout, and upstream's sticker tests fail when a card-mock class runs between two AI test classes (#43, docs/fork/decisions.md)
	@$(GATE) desktop-test mvn -B -pl forge-gui-desktop -am test -Dsurefire.runOrder=alphabetical

web-sweep: ## Card-pool sweep: full games with a scripted human web seat, strict (SHARDS=4; ARGS="-Dforge.web.sweep.duel=40")
	@$(GATE) web-sweep scripts/web-sweep.sh $(ARGS)

web-dev: ## Frontend dev server on a per-worktree port; /ws proxies to this worktree's web-server (live: ?live=1#token=…)
	@port=$$(scripts/dev-port.sh 5200); bridge=$$(scripts/dev-port.sh 7700); echo "Vite on http://localhost:$$port/ (live: http://localhost:$$port/?live=1#token=<bridge token>)"; \
	cd fork-web/frontend && FORGE_BRIDGE=http://127.0.0.1:$$bridge pnpm dev --port $$port --strictPort

web-server: ## Build fork-web and run the bridge server on a per-worktree port (args: ARGS="--mode commander")
	@$(GATE) web-build mvn -B -pl fork-web -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
	@port=$$(scripts/dev-port.sh 7700); echo "Bridge on http://127.0.0.1:$$port/"; \
	cd fork-web && ./run-spike.sh --port $$port $(ARGS)

play: ## Build the frontend and the launcher, then start Forge: lobby matches open in the web match screen (args: ARGS="--no-browser")
	@$(GATE) web-front-build bash -c 'cd fork-web/frontend && pnpm install --frozen-lockfile && pnpm build'
	@$(GATE) play-build mvn -B -pl fork-desktop-web -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
	@fork-desktop-web/run.sh $(ARGS)

package: ## Self-contained app for this OS via jpackage (bundled Java, res/, frontend) -> target/package/ (ARGS="--no-installer")
	@$(GATE) package scripts/package.sh $(ARGS)
