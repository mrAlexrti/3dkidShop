# Pre-correction Batch 1.8 SQL — historical evidence only

These four exact files preserve the manifest and final SQL from owner run
8a6a06d6d0174a1d943c7a7f809cfeeb, which stopped with SQLSTATE 42601.
The local candidate and Production wrapper contain a malformed single-dollar
category postcheck; the verification script has a mismatched closing delimiter.
Do not execute these historical files. They are regression fixtures, not active
migration artifacts. Active paths and hashes are in the current addendum manifest.
