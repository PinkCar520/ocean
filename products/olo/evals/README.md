# OLO evaluation baseline

`datasets/v0.1.jsonl` is the first committed, versioned evaluation manifest.
Cases describe expected invariants; they do not claim model scores. Validate the
dataset without third-party dependencies:

```sh
python3 evals/run.py evals/datasets/v0.1.jsonl --minimum 50
```

The next runner will execute deterministic domain checks and model adapters,
recording task success, provenance completeness, correct tool/argument rate,
unsafe-action escape rate, recovery, latency, and cost where applicable.
