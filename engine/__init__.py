"""
Gap detection and burnout scoring. Ported 1:1 from the frontend's
src/domain/{gapEngine,suggestions,workload}.ts so the mock and the real backend agree.

The rule modules are pure functions over contract models; runner.py does the DB I/O.
"""
