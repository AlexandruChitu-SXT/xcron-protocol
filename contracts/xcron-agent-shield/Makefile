.PHONY: build test coverage coverage-html cs-install cs-start cs-stop cs-test clean proxy-check proxy-gen

# ── Build ──

build:
	sc-meta all build

build-locked:
	sc-meta all build --locked

# ── Unit / Scenario Tests ──

test:
	cargo test -p mx-8004-tests

test-verbose:
	cargo test -p mx-8004-tests -- --nocapture

# ── Coverage (cargo-llvm-cov) ──

COVERAGE_FILTER := '(wasm|meta|interactor|proxies|target|common/|events\.rs|storage\.rs|structs\.rs|cross_contract\.rs|mx-sdk-rs)'

coverage:
	cargo llvm-cov test -p mx-8004-tests \
		--lcov --output-path lcov.info \
		--ignore-filename-regex $(COVERAGE_FILTER)

coverage-html:
	cargo llvm-cov test -p mx-8004-tests \
		--html --output-dir coverage-html \
		--ignore-filename-regex $(COVERAGE_FILTER)
	@echo "Open coverage-html/index.html in your browser"

coverage-summary:
	cargo llvm-cov test -p mx-8004-tests \
		--ignore-filename-regex $(COVERAGE_FILTER)

# ── Chain Simulator ──

cs-install:
	sc-meta cs install

cs-start:
	sc-meta cs start &
	@echo "Waiting for chain simulator to be ready..."
	@sleep 5
	@curl -sf http://localhost:8085/simulator/observers > /dev/null && echo "Chain simulator ready" || echo "Chain simulator not ready yet — check manually"

cs-stop:
	@pkill -f "chain-simulator" 2>/dev/null || true
	@echo "Chain simulator stopped"

# ── Chain Simulator Tests ──

cs-test:
	cargo test -p mx-8004-tests --features chain-simulator-tests -- --test-threads=1

cs-test-verbose:
	cargo test -p mx-8004-tests --features chain-simulator-tests -- --test-threads=1 --nocapture

cs-test-ignored:
	cargo test -p mx-8004-tests --features chain-simulator-tests -- --test-threads=1 --ignored

# ── Proxy Management ──

proxy-gen:
	sc-meta all proxy

proxy-check:
	sc-meta all proxy --compare

# ── Full CI Pipeline ──

ci: build test coverage

ci-full: build test coverage cs-install cs-start cs-test cs-stop

# ── Cleanup ──

clean:
	cargo clean
	rm -rf coverage.lcov coverage-html
	sc-meta all clean
